// AI 向量化（Recraft）：依 Recraft 限制準備圖片 → 經後端 Edge Function 轉換 → 本機 SVGO 最佳化。
// 金鑰、權限與每日上限都在後端處理；這裡只負責圖片尺寸與結果整理。
import { ImageError } from './image';

// Recraft Vectorize 限制：每邊 256–4096 px、最多 1,600 萬像素、20 MB 以內
const MIN_SIDE = 256, MAX_SIDE = 4096, MAX_PIXELS = 16_000_000, MAX_UPLOAD = 15 * 1024 * 1024;

/** 計算送出的尺寸（等比例縮放到 Recraft 可接受的範圍） */
export function aiTargetSize(w, h) {
  let s = Math.min(1, MAX_SIDE / Math.max(w, h), Math.sqrt(MAX_PIXELS / (w * h)));
  if (Math.min(w, h) * s < MIN_SIDE) s = MIN_SIDE / Math.min(w, h); // 太小的圖放大到最短邊 256
  const tw = Math.round(w * s), th = Math.round(h * s);
  if (Math.max(tw, th) > MAX_SIDE) throw new ImageError('圖片比例太細長，Recraft 無法處理（每邊需在 256–4096 px 之間）', 'AI_DIMENSIONS');
  return { width: Math.max(MIN_SIDE, tw), height: Math.max(MIN_SIDE, th), scaled: s !== 1 };
}

const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

/** 依限制縮放並編碼（PNG 保留透明；太大時改用 WEBP） */
export async function prepareForAi(entry) {
  const { width, height } = aiTargetSize(entry.width, entry.height);
  let blob;
  if (width === entry.width && height === entry.height && ['image/png', 'image/jpeg', 'image/webp'].includes(entry.type) && entry.file?.size <= MAX_UPLOAD) {
    blob = entry.file; // 尺寸符合時直接送原檔，不重新壓縮
  } else {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(entry.source, 0, 0, width, height);
    blob = await toBlob(canvas, 'image/png');
    if (!blob || blob.size > MAX_UPLOAD) blob = await toBlob(canvas, 'image/webp', 0.92);
  }
  if (!blob) throw new ImageError('無法處理這張圖片', 'AI_ENCODE');
  if (blob.size > MAX_UPLOAD) throw new ImageError('圖片壓縮後仍超過 15 MB，請先縮小後再試', 'AI_SIZE');
  return { blob, width, height };
}

/** 執行 AI 向量化，回傳與本機引擎相同格式的結果 */
export async function runAiVectorize(api, entry) {
  const t0 = performance.now();
  const { blob, width, height } = await prepareForAi(entry);
  const t1 = performance.now();
  const ext = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/jpeg' ? 'jpg' : 'png';
  const res = await api.vectorizeAi.run(blob, { width, height, name: `${entry.name}.${ext}` });
  const t2 = performance.now();
  const { finalizeSvg } = await import('./svg');
  const { svg, stats } = finalizeSvg(res.svg, { procW: width, procH: height, origW: entry.width, origH: entry.height, keepViewBox: true });
  const t3 = performance.now();
  return {
    svg, stats, engine: 'ai', simulated: !!res.simulated, quota: res.quota, credits: res.credits,
    info: {}, width, height, scaled: width !== entry.width || height !== entry.height,
    timings: { preprocess: t1 - t0, trace: t2 - t1, optimize: t3 - t2, total: t3 - t0 },
  };
}
