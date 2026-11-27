// VTracer（@visioncortex/vtracer）官方套件只提供 Node.js 版的 wasm 膠水程式碼（以 fs 讀取 .wasm）。
// 這個 Vite 外掛把它轉成瀏覽器可用的 ES 模組：virtual:vtracer
//   import { init, vectorize_rgba } from 'virtual:vtracer';
//   await init(wasmUrl);   // 以 fetch 載入 .wasm（Web Worker 內執行）
// 只改動「載入 wasm」與「匯出方式」，演算法本體完全使用官方 wasm。
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const ID = 'virtual:vtracer';
const RESOLVED = '\0' + ID;

export default function vtracerWeb() {
  const require = createRequire(import.meta.url);
  return {
    name: 'vtracer-web',
    resolveId(id) { return id === ID ? RESOLVED : null; },
    load(id) {
      if (id !== RESOLVED) return null;
      const file = require.resolve('@visioncortex/vtracer/pkg/vtracer_wasm.js');
      let code = readFileSync(file, 'utf8');
      code = code.replace(/^exports\.\w+\s*=\s*\w+;\s*$/gm, '');
      const tail = code.indexOf('const wasmPath');
      if (tail < 0) throw new Error('vtracer-web: 無法辨識 vtracer 膠水程式碼格式（套件版本可能已變更）');
      code = code.slice(0, tail) + `
let wasm;
let initPromise = null;
export function init(url) {
  if (!initPromise) {
    initPromise = (async () => {
      const imports = __wbg_get_imports();
      const res = await fetch(url);
      if (!res.ok) throw new Error('無法載入向量化引擎（HTTP ' + res.status + '）');
      let instance;
      if (typeof WebAssembly.instantiateStreaming === 'function' && (res.headers.get('content-type') || '').includes('application/wasm')) {
        ({ instance } = await WebAssembly.instantiateStreaming(res, imports));
      } else {
        ({ instance } = await WebAssembly.instantiate(await res.arrayBuffer(), imports));
      }
      wasm = instance.exports;
      wasm.__wbindgen_start();
    })();
    initPromise.catch(() => { initPromise = null; });
  }
  return initPromise;
}
export { vectorize_rgba, vectorize_bytes };
`;
      return code;
    },
  };
}
