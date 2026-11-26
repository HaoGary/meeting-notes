// 語音辨識引擎設定：預設使用瀏覽器原生 Web Speech API（透過 react-speech-recognition）。
// 預覽環境無法取得麥克風，因此提供「模擬」模式（以 polyfill 套用），正式版不會啟用。
import SpeechRecognition from 'react-speech-recognition';

export const SPEECH_MODES = [
  ['real', '使用實際麥克風'],
  ['demo', '模擬語音輸入'],
  ['not-allowed', '模擬：麥克風權限被拒'],
  ['network', '模擬：網路異常'],
  ['no-speech', '模擬：沒有偵測到聲音'],
  ['unsupported', '模擬：瀏覽器不支援'],
];
export const speechDev = { mode: 'real' };

const PHRASES = [
  '本次會議主要討論二零二七年第一季日本線的產品規劃',
  '北海道雪祭團預計十二月十日前完成上架',
  '請林怡君負責彙整房源資料並於下週三前回報',
  '東京自由行的定價維持去年水準',
];
let phraseIndex = 0;

// 模擬 SpeechRecognition：依序「說出」示範句子，產生即時（interim）與最終（final）結果
function makeDemoRecognition(mode) {
  return class DemoRecognition extends EventTarget {
    constructor() {
      super();
      this.continuous = false; this.interimResults = true; this.lang = 'zh-TW';
      this.onresult = null; this.onend = null; this.onerror = null;
      this._timers = []; this._results = []; this._running = false;
    }
    _emit(type, props = {}) {
      const e = new Event(type); Object.assign(e, props);
      this.dispatchEvent(e);
      const h = this['on' + type]; if (typeof h === 'function') h.call(this, e);
    }
    _later(ms, fn) { this._timers.push(setTimeout(fn, ms)); }
    _clear() { this._timers.forEach(clearTimeout); this._timers = []; }
    _result(i) { const r = this._results; this._emit('result', { resultIndex: i, results: r }); }
    start() {
      if (this._running) throw new DOMException('already started', 'InvalidStateError');
      this._running = true; this._results = [];
      this._later(250, () => this._emit('start'));
      if (mode !== 'demo') {
        this._later(mode === 'not-allowed' ? 400 : 1200, () => { this._emit('error', { error: mode }); this._finish(0); });
        return;
      }
      this._later(700, () => { this._emit('audiostart'); this._speak(); });
    }
    _speak() {
      const text = PHRASES[phraseIndex++ % PHRASES.length];
      const idx = this._results.length;
      const item = [{ transcript: '', confidence: 0.92 }]; item.isFinal = false;
      this._results.push(item);
      let n = 0;
      const step = () => {
        n = Math.min(text.length, n + 2);
        item[0] = { transcript: text.slice(0, n), confidence: 0.92 };
        if (n >= text.length) { item.isFinal = true; this._result(idx); this._later(900, () => this._speak()); }
        else { this._result(idx); this._later(140, step); }
      };
      this._later(400, step);
    }
    _finish(ms) { this._later(ms, () => { this._running = false; this._emit('end'); }); }
    stop() { // 停止時把尚未完成的句子當作最終結果送出，再結束
      this._clear();
      const last = this._results[this._results.length - 1];
      if (last && !last.isFinal && last[0].transcript) { last.isFinal = true; this._later(300, () => this._result(this._results.length - 1)); }
      this._finish(700);
    }
    abort() { this._clear(); this._finish(30); }
  };
}

// 套用目前模式並建立新的辨識器（權限被拒後套件會停用舊辨識器，重試時需重建）
export function resetRecognizer() {
  if (speechDev.mode === 'real' || speechDev.mode === 'unsupported') SpeechRecognition.removePolyfill();
  else SpeechRecognition.applyPolyfill(makeDemoRecognition(speechDev.mode));
}
export function setSpeechMode(mode) { speechDev.mode = mode; resetRecognizer(); }
