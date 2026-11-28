// 語音轉文字 hook：包裝 react-speech-recognition，補上狀態機、錯誤分類與「草稿」管理。
// - 只把新的「最終辨識結果」追加到草稿，使用者在草稿中的修改不會被覆蓋
// - 預設繁體中文（zh-TW）、連續辨識
import { useCallback, useEffect, useRef, useState } from 'react';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import { resetRecognizer, speechDev } from './speechSetup';
import { devFlags } from '../../services/devFlags';

export const SPEECH_ERRORS = {
  unsupported: { title: '瀏覽器不支援語音辨識', message: '請改用最新版 Chrome、Edge 或 Safari，或直接以鍵盤輸入。', retry: false },
  'not-allowed': { title: '無法使用麥克風', message: '麥克風權限被拒絕。請點擊網址列左側的鎖頭圖示，將「麥克風」設為允許後再試一次。', retry: true },
  'service-not-allowed': { title: '無法使用語音辨識服務', message: '瀏覽器或系統設定停用了語音辨識服務，請檢查設定後再試一次。', retry: true },
  'audio-capture': { title: '找不到麥克風', message: '請確認麥克風已連接且未被其他程式占用。', retry: true },
  network: { title: '網路連線異常', message: '語音辨識需要網路連線，請檢查網路後再試一次。已辨識的文字會保留。', retry: true },
  'no-speech': { title: '沒有偵測到聲音', message: '請確認麥克風沒有靜音，並靠近麥克風說話後再試一次。', retry: true },
  'language-not-supported': { title: '不支援此語言', message: '目前瀏覽器不支援所選語言的語音辨識。', retry: false },
  'start-failed': { title: '無法啟動語音辨識', message: '麥克風沒有開始收音。請確認瀏覽器已允許使用麥克風、裝置已連接，再試一次。', retry: true },
  unknown: { title: '語音辨識失敗', message: '發生未預期的錯誤，請再試一次。', retry: true },
};
const toError = (code) => ({ code, ...(SPEECH_ERRORS[code] || SPEECH_ERRORS.unknown) });

const CJK = /[㐀-鿿豈-﫿]/;
// 串接辨識片段：中文片段之間補全形逗號，英文補空白
export function joinText(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (/\s$/.test(a)) return a + b;
  const last = a.slice(-1);
  if (CJK.test(last) && CJK.test(b[0])) return `${a}，${b}`;
  if (/[\u3000-\u303f\uff00-\uffef,.!?;:]$/.test(a)) return a + b; // 已有標點（含全形括號、引號）
  return `${a} ${b}`;
}

export function useSpeechToText({ language = 'zh-TW' } = {}) {
  const { interimTranscript, finalTranscript, listening, browserSupportsSpeechRecognition } = useSpeechRecognition({ clearTranscriptOnListen: false });
  const [phase, setPhase] = useState('idle'); // idle | starting | listening | finishing | stopped
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const consumed = useRef(0);
  const detach = useRef(() => {});
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const supported = browserSupportsSpeechRecognition && speechDev.mode !== 'unsupported';

  // 新的最終結果 → 追加到草稿
  useEffect(() => {
    if (finalTranscript.length < consumed.current) consumed.current = 0;
    const add = finalTranscript.slice(consumed.current).trim();
    consumed.current = finalTranscript.length;
    if (add) setDraft((d) => joinText(d, add));
  }, [finalTranscript]);

  // 瀏覽器自行結束（非使用者按停止）；若從未開始收音且沒有錯誤事件，提示無法啟動
  useEffect(() => {
    if (listening || !['starting', 'listening'].includes(phaseRef.current)) return;
    if (phaseRef.current === 'starting') setError((e) => e || toError('start-failed'));
    setPhase('stopped');
  }, [listening]);

  // 錄音計時
  useEffect(() => {
    if (phase !== 'listening') return;
    const t0 = Date.now() - elapsed * 1000;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 250);
    return () => clearInterval(id);
  }, [phase]); // eslint-disable-line

  const attach = () => {
    detach.current();
    const rec = SpeechRecognition.getRecognition();
    if (!rec?.addEventListener) return;
    const onAudio = () => setPhase((p) => (p === 'starting' ? 'listening' : p));
    const onErr = (e) => {
      if (e.error === 'aborted') return;
      setError(toError(e.error));
      SpeechRecognition.abortListening().catch(() => {}); // 避免連續模式自動重啟造成錯誤迴圈
      setPhase('stopped');
    };
    rec.addEventListener('audiostart', onAudio);
    rec.addEventListener('error', onErr);
    detach.current = () => { rec.removeEventListener('audiostart', onAudio); rec.removeEventListener('error', onErr); };
  };
  useEffect(() => () => { detach.current(); SpeechRecognition.abortListening().catch(() => {}); }, []);

  const start = useCallback(async () => {
    setError(null);
    if (!supported) { setError(toError('unsupported')); return; }
    if (!navigator.onLine || devFlags.failSaves) { setError(toError('network')); return; }
    resetRecognizer();
    attach();
    setPhase('starting');
    try { await SpeechRecognition.startListening({ continuous: true, language }); }
    catch { setError(toError('not-allowed')); setPhase('stopped'); }
  }, [supported, language]); // eslint-disable-line

  const stop = useCallback(async () => {
    setPhase('finishing'); // 等待最後一段辨識結果
    try { await SpeechRecognition.stopListening(); } catch {}
    setPhase('stopped');
  }, []);

  const clear = useCallback(() => { setDraft(''); setElapsed(0); }, []);
  const reset = useCallback(async () => {
    detach.current();
    try { await SpeechRecognition.abortListening(); } catch {}
    setDraft(''); setError(null); setPhase('idle'); setElapsed(0);
  }, []);

  return {
    phase, error, draft, setDraft, interim: phase === 'listening' || phase === 'finishing' ? interimTranscript : '',
    elapsed, supported, start, stop, clear, reset, dismissError: () => setError(null),
  };
}
