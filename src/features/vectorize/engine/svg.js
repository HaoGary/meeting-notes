// SVG 後處理：補 viewBox、還原原圖尺寸、以 SVGO 最佳化路徑並統計結果。
import { optimize } from 'svgo/browser';

const SVGO_CONFIG = {
  multipass: true,
  floatPrecision: 2,
  plugins: [
    // preset-default（v4）會保留 viewBox；並包含 convertPathData（簡化路徑、減少節點）、mergePaths 等
    { name: 'preset-default', params: { overrides: { convertPathData: { floatPrecision: 2, makeArcs: false } } } },
    'sortAttrs',
  ],
};

/**
 * @param {string} raw VTracer 輸出
 * @param {{ procW:number, procH:number, origW:number, origH:number, background?:string, optimize?:boolean }} o
 */
export function finalizeSvg(raw, o) {
  // 以處理尺寸作為座標系，輸出尺寸還原為原圖大小（等比例，不變形）
  let svg = raw.replace(/<svg\b[^>]*>/, () =>
    `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${o.origW}" height="${o.origH}" viewBox="0 0 ${o.procW} ${o.procH}">`
    + (o.background ? `<rect width="${o.procW}" height="${o.procH}" fill="${o.background}"/>` : ''));
  const rawBytes = byteLength(svg);
  if (o.optimize !== false) {
    const r = optimize(svg, SVGO_CONFIG);
    svg = r.data;
  }
  if (!/^<\?xml/.test(svg)) svg = '<?xml version="1.0" encoding="UTF-8"?>\n' + svg;
  return { svg, stats: svgStats(svg, rawBytes) };
}

export function svgStats(svg, rawBytes) {
  const paths = (svg.match(/<path\b/g) || []).length;
  const shapes = paths + (svg.match(/<(rect|circle|ellipse|polygon|polyline)\b/g) || []).length;
  const colors = new Set((svg.match(/fill="(#[0-9a-f]{3,8}|[a-z]+)"/gi) || []).map((s) => s.slice(6, -1).toLowerCase()));
  colors.delete('none');
  // SVGO 會移除預設的黑色 fill，沒有 fill 屬性的路徑即為黑色
  if ((svg.match(/<path\b[^>]*>/g) || []).some((t) => !/\sfill=/.test(t)) && !/<g\b[^>]*\sfill=/.test(svg)) colors.add('#000');
  // 節點數：路徑資料中的指令數（約略）
  let nodes = 0;
  for (const m of svg.matchAll(/\sd="([^"]*)"/g)) nodes += (m[1].match(/[a-df-z]/gi) || []).length;
  return { paths, shapes, colors: colors.size, nodes, bytes: byteLength(svg), rawBytes };
}

const byteLength = (s) => new TextEncoder().encode(s).length;
