// 圖片前處理（純函式，於 Web Worker 執行）：透明度整理、去雜訊、顏色量化、灰階、黑白二值化。
// 輸入輸出皆為 RGBA8（Uint8ClampedArray，width × height × 4）。

const ALPHA_CUT = 128;

/** 透明度整理：保留透明時把半透明二值化（避免邊緣出現光暈色塊）；不保留時與白色合成 */
export function normalizeAlpha(px, transparent) {
  let hasAlpha = false;
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3];
    if (a === 255) continue;
    hasAlpha = true;
    if (transparent) {
      if (a < ALPHA_CUT) { px[i] = px[i + 1] = px[i + 2] = px[i + 3] = 0; } else px[i + 3] = 255;
    } else {
      const t = a / 255;
      px[i] = px[i] * t + 255 * (1 - t);
      px[i + 1] = px[i + 1] * t + 255 * (1 - t);
      px[i + 2] = px[i + 2] * t + 255 * (1 - t);
      px[i + 3] = 255;
    }
  }
  return hasAlpha;
}

/** 去雜訊：只對不透明像素做可分離的方框模糊（重複 2 次近似高斯），透明區不會滲色 */
export function denoise(px, w, h, radius) {
  const r = Math.round(radius);
  if (r <= 0) return;
  const n = w * h;
  const ch = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  const m = new Float32Array(n);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const on = px[i + 3] > 0 ? 1 : 0;
    m[p] = on; ch[0][p] = px[i] * on; ch[1][p] = px[i + 1] * on; ch[2][p] = px[i + 2] * on;
  }
  const tmp = new Float32Array(Math.max(w, h));
  const pass = (arr) => {
    // 水平
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let sum = 0;
      for (let x = -r; x <= r; x++) sum += arr[row + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        tmp[x] = sum;
        sum += arr[row + Math.min(w - 1, x + r + 1)] - arr[row + Math.max(0, x - r)];
      }
      for (let x = 0; x < w; x++) arr[row + x] = tmp[x];
    }
    // 垂直
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let y = -r; y <= r; y++) sum += arr[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        tmp[y] = sum;
        sum += arr[Math.min(h - 1, y + r + 1) * w + x] - arr[Math.max(0, y - r) * w + x];
      }
      for (let y = 0; y < h; y++) arr[y * w + x] = tmp[y];
    }
  };
  for (let k = 0; k < 2; k++) { pass(ch[0]); pass(ch[1]); pass(ch[2]); pass(m); }
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    if (!px[i + 3] || m[p] <= 0) continue;
    px[i] = ch[0][p] / m[p]; px[i + 1] = ch[1][p] / m[p]; px[i + 2] = ch[2][p] / m[p];
  }
}

const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

export function toGray(px) {
  for (let i = 0; i < px.length; i += 4) {
    const v = lum(px[i], px[i + 1], px[i + 2]);
    px[i] = px[i + 1] = px[i + 2] = v;
  }
}

/** Otsu 自動閾值（只計算不透明像素） */
export function otsu(px) {
  const hist = new Float64Array(256);
  let total = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (!px[i + 3]) continue;
    hist[Math.round(lum(px[i], px[i + 1], px[i + 2]))]++; total++;
  }
  if (!total) return 128;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0, wB = 0, best = 0, th = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue;
    const wF = total - wB; if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; th = t; }
  }
  return th + 1;
}

/** 黑白：亮度低於閾值為黑（前景），其餘為白；透明像素視為白色背景。回傳實際使用的閾值 */
export function binarize(px, threshold) {
  const t = threshold === 'auto' ? otsu(px) : threshold;
  for (let i = 0; i < px.length; i += 4) {
    const dark = px[i + 3] > 0 && lum(px[i], px[i + 1], px[i + 2]) < t;
    const v = dark ? 0 : 255;
    px[i] = px[i + 1] = px[i + 2] = v; px[i + 3] = 255;
  }
  return t;
}

/** 以 k-means++ 量化顏色：取樣計算色票，再把每個像素對應到最接近的顏色 */
export function quantize(px, k, { maxSamples = 24000, iterations = 12 } = {}) {
  const opaque = [];
  for (let i = 0; i < px.length; i += 4) if (px[i + 3]) opaque.push(i);
  if (!opaque.length) return [];
  const step = Math.max(1, Math.floor(opaque.length / maxSamples));
  const S = [];
  for (let j = 0; j < opaque.length; j += step) { const i = opaque[j]; S.push(px[i], px[i + 1], px[i + 2]); }
  const ns = S.length / 3;
  k = Math.max(1, Math.min(k, ns));

  // 固定亂數種子，讓相同參數得到相同結果
  let seed = 1234567;
  const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);

  const C = new Float64Array(k * 3);
  const d2 = new Float64Array(ns).fill(Infinity);
  let first = Math.floor(rand() * ns);
  C.set([S[first * 3], S[first * 3 + 1], S[first * 3 + 2]], 0);
  for (let c = 1; c < k; c++) {
    let sum = 0;
    for (let s = 0; s < ns; s++) {
      const dr = S[s * 3] - C[(c - 1) * 3], dg = S[s * 3 + 1] - C[(c - 1) * 3 + 1], db = S[s * 3 + 2] - C[(c - 1) * 3 + 2];
      const d = dr * dr + dg * dg + db * db;
      if (d < d2[s]) d2[s] = d;
      sum += d2[s];
    }
    let target = rand() * sum, pick = ns - 1;
    for (let s = 0; s < ns; s++) { target -= d2[s]; if (target <= 0) { pick = s; break; } }
    C.set([S[pick * 3], S[pick * 3 + 1], S[pick * 3 + 2]], c * 3);
  }
  const nearest = (r, g, b) => {
    let bi = 0, bd = Infinity;
    for (let c = 0; c < k; c++) {
      const dr = r - C[c * 3], dg = g - C[c * 3 + 1], db = b - C[c * 3 + 2];
      const d = dr * dr + dg * dg + db * db;
      if (d < bd) { bd = d; bi = c; }
    }
    return bi;
  };
  const acc = new Float64Array(k * 4);
  for (let it = 0; it < iterations; it++) {
    acc.fill(0);
    for (let s = 0; s < ns; s++) {
      const c = nearest(S[s * 3], S[s * 3 + 1], S[s * 3 + 2]);
      acc[c * 4] += S[s * 3]; acc[c * 4 + 1] += S[s * 3 + 1]; acc[c * 4 + 2] += S[s * 3 + 2]; acc[c * 4 + 3]++;
    }
    let moved = 0;
    for (let c = 0; c < k; c++) {
      const cnt = acc[c * 4 + 3];
      if (!cnt) continue;
      for (let j = 0; j < 3; j++) { const v = acc[c * 4 + j] / cnt; moved += Math.abs(v - C[c * 3 + j]); C[c * 3 + j] = v; }
    }
    if (moved < 0.5) break;
  }
  const pal = [];
  for (let c = 0; c < k; c++) pal.push([Math.round(C[c * 3]), Math.round(C[c * 3 + 1]), Math.round(C[c * 3 + 2])]);

  // 對應：以 6-bit/色版 的查表快取加速
  const cache = new Int16Array(1 << 18).fill(-1);
  const used = new Uint32Array(k);
  for (const i of opaque) {
    const key = ((px[i] >> 2) << 12) | ((px[i + 1] >> 2) << 6) | (px[i + 2] >> 2);
    let c = cache[key];
    if (c < 0) { c = nearest(px[i], px[i + 1], px[i + 2]); cache[key] = c; }
    px[i] = pal[c][0]; px[i + 1] = pal[c][1]; px[i + 2] = pal[c][2];
    used[c]++;
  }
  // 合併重複色、移除未使用的顏色
  const out = new Map();
  pal.forEach((p, c) => { if (used[c]) out.set(hex(p), p); });
  return [...out.values()];
}

/** 忽略白色：接近白色的像素改為透明（當作背景，不產生路徑） */
export function dropWhite(px, palette, min = 235) {
  const white = (r, g, b) => r >= min && g >= min && b >= min;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] && white(px[i], px[i + 1], px[i + 2])) px[i] = px[i + 1] = px[i + 2] = px[i + 3] = 0;
  }
  return palette.filter((p) => !white(...p));
}

export const hex = ([r, g, b]) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

/** 完整前處理流程 */
export function preprocess(px, w, h, pre) {
  const info = {};
  info.hadAlpha = normalizeAlpha(px, pre.transparent);
  if (pre.blur > 0) denoise(px, w, h, pre.blur);
  if (pre.mode === 'bw') {
    info.threshold = binarize(px, pre.threshold);
    return info;
  }
  if (pre.mode === 'gray') toGray(px);
  if (pre.colors > 0) {
    let pal = quantize(px, pre.colors);
    if (pre.ignoreWhite) pal = dropWhite(px, pal);
    info.palette = pal.map(hex);
  } else if (pre.ignoreWhite) {
    dropWhite(px, []);
  }
  return info;
}
