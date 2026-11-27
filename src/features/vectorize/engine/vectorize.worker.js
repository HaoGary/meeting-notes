// 向量化 Web Worker：前處理 → VTracer（WebAssembly）→ SVGO 最佳化。
// 所有運算都在瀏覽器內完成，圖片不會上傳到任何伺服器。
//
// 訊息格式
//   主執行緒 → worker：{ type: 'run', id, wasmUrl, image: { data, width, height }, original: { width, height }, pipeline }
//   worker → 主執行緒：{ type: 'progress', id, stage, pct } | { type: 'done', id, svg, stats, info, timings } | { type: 'error', id, code, message }
import { init, vectorize_rgba } from 'virtual:vtracer';
import { preprocess } from './preprocess';
import { finalizeSvg } from './svg';

const post = (msg) => self.postMessage(msg);

self.onmessage = async (e) => {
  const msg = e.data;
  if (msg?.type !== 'run') return;
  const { id, wasmUrl, image, original, pipeline } = msg;
  const progress = (stage, pct) => post({ type: 'progress', id, stage, pct });
  const t0 = performance.now();
  const timings = {};
  let stage = 'init';
  try {
    progress('init', 5);
    await init(wasmUrl);
    timings.init = performance.now() - t0;

    stage = 'preprocess';
    progress('preprocess', 15);
    let t = performance.now();
    const px = new Uint8ClampedArray(image.data);
    const info = preprocess(px, image.width, image.height, pipeline.pre);
    timings.preprocess = performance.now() - t;

    if (pipeline.pre.mode !== 'bw' && info.palette && !info.palette.length) {
      throw Object.assign(new Error('圖片中沒有可描繪的內容（可能整張都是透明或已被「忽略白色」移除）'), { code: 'EMPTY' });
    }

    stage = 'trace';
    progress('trace', 40);
    t = performance.now();
    const options = { ...pipeline.trace, ...(info.palette?.length ? { palette: info.palette } : {}) };
    const raw = vectorize_rgba(new Uint8Array(px.buffer), image.width, image.height, options);
    timings.trace = performance.now() - t;
    if (!/<path\b/.test(raw)) {
      throw Object.assign(new Error('沒有產生任何路徑，請調整參數（例如降低雜訊去除或提高細節程度）'), { code: 'EMPTY' });
    }

    stage = 'optimize';
    progress('optimize', 85);
    t = performance.now();
    const bg = !pipeline.pre.transparent && pipeline.pre.mode === 'bw' ? '#ffffff' : null;
    const { svg, stats } = finalizeSvg(raw, {
      procW: image.width, procH: image.height, origW: original.width, origH: original.height, background: bg,
    });
    timings.optimize = performance.now() - t;
    timings.total = performance.now() - t0;
    post({ type: 'done', id, svg, stats, info, timings });
  } catch (err) {
    const oom = err instanceof RangeError || /memory|allocation/i.test(err?.message || '');
    post({
      type: 'error', id,
      code: err?.code || (oom ? 'OOM' : stage === 'init' ? 'ENGINE' : 'FAILED'),
      message: oom
        ? '記憶體不足，請把「最大處理尺寸」調小後再試'
        : stage === 'init'
          ? `向量化引擎載入失敗：${err?.message || err}`
          : err?.message || String(err),
    });
  }
};
