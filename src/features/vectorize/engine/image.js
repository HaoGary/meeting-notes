// 圖片載入與縮放（主執行緒，Canvas API）。
export const ACCEPT = ['image/png', 'image/jpeg', 'image/webp'];
export const ACCEPT_EXT = /\.(png|jpe?g|webp)$/i;
export const MAX_FILE_MB = 40;
const MAX_PIXELS = 80_000_000; // 解碼後的像素上限（約 8900×8900）

export class ImageError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

let seq = 0;

/** 讀取並解碼圖片檔；回傳的物件用於預覽與後續取得像素 */
export async function loadImageFile(file) {
  if (!file) throw new ImageError('沒有選擇檔案', 'NO_FILE');
  const typeOk = ACCEPT.includes(file.type) || (!file.type && ACCEPT_EXT.test(file.name));
  if (!typeOk) throw new ImageError(`不支援的檔案格式${file.type ? `（${file.type}）` : ''}，請使用 PNG、JPG 或 WEBP`, 'TYPE');
  if (file.size > MAX_FILE_MB * 1024 * 1024) throw new ImageError(`檔案太大（${(file.size / 1048576).toFixed(1)} MB），上限為 ${MAX_FILE_MB} MB`, 'SIZE');
  let source;
  try {
    source = typeof createImageBitmap === 'function' ? await createImageBitmap(file) : await decodeWithImg(file);
  } catch {
    throw new ImageError('無法讀取這張圖片，檔案可能已損毀或格式不正確', 'DECODE');
  }
  const width = source.width, height = source.height;
  if (!width || !height) throw new ImageError('圖片尺寸不正確', 'DECODE');
  if (width * height > MAX_PIXELS) throw new ImageError(`圖片太大（${width}×${height}），請先縮小到 8000 萬像素以內`, 'PIXELS');
  return {
    key: `img${++seq}`,
    name: file.name.replace(/\.[^.]+$/, '') || 'image',
    type: file.type, size: file.size, width, height,
    url: URL.createObjectURL(file),
    file,
    source,
    pixels: new Map(),
  };
}

function decodeWithImg(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

/** 取得處理用的像素（必要時等比例縮小到最長邊 maxSize），依尺寸快取 */
export function getPixels(entry, maxSize) {
  const scale = Math.min(1, maxSize / Math.max(entry.width, entry.height));
  const w = Math.max(1, Math.round(entry.width * scale));
  const h = Math.max(1, Math.round(entry.height * scale));
  const key = `${w}x${h}`;
  if (entry.pixels.has(key)) return entry.pixels.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(entry.source, 0, 0, w, h);
  let data;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    throw new ImageError('瀏覽器無法讀取圖片像素，請改用其他圖片', 'CANVAS');
  }
  const out = { width: w, height: h, scaled: scale < 1, data };
  entry.pixels.clear(); // 只保留目前尺寸，避免大圖占用過多記憶體
  entry.pixels.set(key, out);
  return out;
}

export function releaseImage(entry) {
  if (!entry) return;
  URL.revokeObjectURL(entry.url);
  entry.source?.close?.();
  entry.pixels.clear();
}
