// 向量化參數：介面上的參數（0–100 的滑桿等）→ 前處理設定 + VTracer 選項。
// 這個檔案不依賴 DOM 或 React，主執行緒與 Web Worker 共用。

export const MODES = {
  color: '彩色',
  gray: '灰階',
  bw: '黑白',
};

export const DEFAULT_PARAMS = {
  mode: 'color',       // color | gray | bw
  colors: 8,           // 彩色：2–64，0 = 自動
  grays: 6,            // 灰階：2–32
  threshold: 128,      // 黑白：0–255，'auto' 時使用 Otsu 自動閾值
  autoThreshold: true,
  detail: 60,          // 細節程度 0–100（越高保留越多小區塊）
  smooth: 50,          // 輪廓平滑 0–100（0 = 多邊形直線）
  noise: 25,           // 雜訊去除 0–100（模糊 + 移除小斑點）
  transparent: true,   // 保留透明背景（透明區域不產生路徑）
  ignoreWhite: false,  // 忽略白色：把接近白色的區域視為背景
  maxSize: 2000,       // 大圖自動縮小：最長邊上限（px）
};

export const PRESETS = [
  { key: 'logo', label: '標誌、圖示', params: { mode: 'color', colors: 6, detail: 70, smooth: 60, noise: 15 } },
  { key: 'illust', label: '插畫', params: { mode: 'color', colors: 16, detail: 75, smooth: 50, noise: 25 } },
  { key: 'photo', label: '照片', params: { mode: 'color', colors: 32, detail: 55, smooth: 40, noise: 50 } },
  { key: 'gray', label: '灰階', params: { mode: 'gray', grays: 6, detail: 60, smooth: 50, noise: 35 } },
  { key: 'lineart', label: '黑白線稿', params: { mode: 'bw', autoThreshold: true, detail: 80, smooth: 55, noise: 10 } },
];

export const MAX_SIZES = [1000, 2000, 3000, 4000];

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** 只保留會影響結果的參數（避免不相關的設定變動造成重新計算） */
export function effectiveParams(p) {
  const base = { mode: p.mode, detail: p.detail, smooth: p.smooth, noise: p.noise, transparent: p.transparent, maxSize: p.maxSize };
  if (p.mode === 'color') return { ...base, colors: p.colors, ignoreWhite: p.ignoreWhite };
  if (p.mode === 'gray') return { ...base, grays: p.grays, ignoreWhite: p.ignoreWhite };
  return { ...base, autoThreshold: p.autoThreshold, threshold: p.autoThreshold ? null : p.threshold };
}

/** 介面參數 → 前處理設定與 VTracer 選項 */
export function buildPipeline(p) {
  const d = clamp(p.detail, 0, 100) / 100;
  const s = clamp(p.smooth, 0, 100) / 100;
  const n = clamp(p.noise, 0, 100) / 100;

  const pre = {
    mode: p.mode,
    colors: p.mode === 'color' ? clamp(p.colors | 0, 0, 64) : p.mode === 'gray' ? clamp(p.grays | 0, 2, 32) : 2,
    threshold: p.mode === 'bw' ? (p.autoThreshold ? 'auto' : clamp(p.threshold | 0, 0, 255)) : null,
    blur: Math.round(n * 3 * 10) / 10,   // 0–3 px 的模糊半徑
    transparent: !!p.transparent,
    ignoreWhite: p.mode !== 'bw' && !!p.ignoreWhite,
  };

  // VTracer：filterSpeckle 為「忽略小於 N×N px 的斑點」
  const speckle = Math.round(clamp(lerp(14, 1, d) + n * 8, 1, 32));
  const trace = {
    mode: s === 0 ? 'polygon' : 'spline',
    hierarchical: 'stacked',            // 疊加模式：不產生挖洞形狀，檔案較精簡
    filterSpeckle: speckle,
    cornerThreshold: Math.round(lerp(30, 140, s)),  // 角度越大越平滑
    lengthThreshold: Math.round(lerp(3.5, 7, s) * 10) / 10,
    spliceThreshold: 45,
    maxIterations: 10,
    pathPrecision: 2,
    ...(s > 0.15 ? { simplify: Math.round(lerp(0, 2.2, s) * 10) / 10 } : {}),
  };
  if (p.mode === 'bw') {
    Object.assign(trace, { clustering: 'bw', binaryThreshold: 128 });
  } else if (pre.colors > 0) {
    // 前處理已把顏色量化成固定色票：讓 VTracer 精確使用這些顏色，不再合併
    Object.assign(trace, { colorPrecision: 8, layerDifference: 0 });
  } else {
    Object.assign(trace, { colorPrecision: Math.round(lerp(4, 7, d)), layerDifference: Math.round(lerp(32, 8, d)) });
  }
  return { pre, trace };
}

/** 結果快取用的鍵 */
export const paramsKey = (p) => JSON.stringify(effectiveParams(p));
