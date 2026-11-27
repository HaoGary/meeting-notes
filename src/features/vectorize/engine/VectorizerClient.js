// 向量化引擎的主執行緒介面：管理 Web Worker、進度、取消與結果快取。UI 只需要呼叫 run() / cancel()。
import VectorizeWorker from './vectorize.worker.js?worker&inline';
import wasmAsset from '@visioncortex/vtracer/pkg/vtracer_wasm_bg.wasm?url';
import { buildPipeline, paramsKey } from './params';
import { getPixels } from './image';

export const STAGES = { init: '載入向量化引擎', preprocess: '圖片前處理', trace: '描繪向量路徑', optimize: '最佳化 SVG' };

export class CancelledError extends Error {
  constructor() { super('已取消轉換'); this.code = 'CANCELLED'; }
}

export class VectorizerClient {
  constructor({ cacheSize = 8 } = {}) {
    this.worker = null;
    this.pending = null;
    this.seq = 0;
    this.cache = new Map();
    this.cacheSize = cacheSize;
    this.wasmUrl = new URL(wasmAsset, location.href).href;
  }

  ensureWorker() {
    if (!this.worker) {
      this.worker = new VectorizeWorker();
      this.worker.onmessage = (e) => this.onMessage(e.data);
      this.worker.onerror = (e) => {
        e.preventDefault?.();
        this.fail({ code: 'WORKER', message: `背景處理程序發生錯誤：${e.message || '未知錯誤'}` });
        this.reset();
      };
    }
    return this.worker;
  }

  /** 參數與圖片都相同時直接回傳快取結果，不重複運算 */
  cached(image, params) {
    return this.cache.get(`${image.key}|${paramsKey(params)}`) || null;
  }

  /**
   * 執行向量化。若已有進行中的工作會先取消。
   * @returns {Promise<{svg, stats, info, timings, width, height, cached}>}
   */
  run(image, params, { onProgress } = {}) {
    const key = `${image.key}|${paramsKey(params)}`;
    const hit = this.cache.get(key);
    if (hit) {
      this.cache.delete(key); this.cache.set(key, hit); // LRU
      return Promise.resolve({ ...hit, cached: true });
    }
    if (this.pending) this.cancel();
    const px = getPixels(image, params.maxSize);
    const id = ++this.seq;
    const worker = this.ensureWorker();
    return new Promise((resolve, reject) => {
      this.pending = { id, resolve, reject, onProgress, key, px };
      worker.postMessage({
        type: 'run', id, wasmUrl: this.wasmUrl,
        // 傳送副本：快取的原始像素保留給下一次調整參數使用
        image: { data: px.data.slice().buffer, width: px.width, height: px.height },
        original: { width: image.width, height: image.height },
        pipeline: buildPipeline(params),
      });
    });
  }

  onMessage(msg) {
    const p = this.pending;
    if (!p || msg.id !== p.id) return; // 已取消的舊工作
    if (msg.type === 'progress') { p.onProgress?.(msg.stage, msg.pct); return; }
    this.pending = null;
    if (msg.type === 'done') {
      const result = { svg: msg.svg, stats: msg.stats, info: msg.info, timings: msg.timings, width: p.px.width, height: p.px.height, scaled: p.px.scaled };
      this.cache.set(p.key, result);
      while (this.cache.size > this.cacheSize) this.cache.delete(this.cache.keys().next().value);
      p.resolve({ ...result, cached: false });
    } else if (msg.type === 'error') {
      p.reject(Object.assign(new Error(msg.message), { code: msg.code }));
    }
  }

  fail(err) {
    const p = this.pending;
    this.pending = null;
    p?.reject(Object.assign(new Error(err.message), { code: err.code }));
  }

  /** 取消進行中的轉換：VTracer 為同步運算，直接終止 Worker 才能立即停止 */
  cancel() {
    if (!this.pending) return false;
    const p = this.pending;
    this.pending = null;
    this.reset();
    p.reject(new CancelledError());
    return true;
  }

  reset() {
    this.worker?.terminate();
    this.worker = null;
  }

  dispose() {
    this.cancel();
    this.reset();
    this.cache.clear();
  }
}
