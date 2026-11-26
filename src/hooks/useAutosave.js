// 自動儲存：防抖、序列化（同時只有一個請求）、失敗保留待存內容、可重試、離開前 flush。
import { useCallback, useEffect, useRef, useState } from 'react';

export function useAutosave(saveFn, { delay = 1500, merge } = {}) {
  const [state, setState] = useState({ status: 'saved', savedAt: null, error: null });
  const pending = useRef(null);
  const inflight = useRef(null);
  const timer = useRef(null);
  const saveRef = useRef(saveFn);
  saveRef.current = saveFn;

  const run = useCallback(async () => {
    clearTimeout(timer.current);
    if (inflight.current) await inflight.current.catch(() => {});
    const payload = pending.current;
    if (payload == null) return true;
    pending.current = null;
    setState((s) => ({ ...s, status: 'saving' }));
    const p = Promise.resolve().then(() => saveRef.current(payload));
    inflight.current = p;
    try {
      await p;
      inflight.current = null;
      if (pending.current == null) setState({ status: 'saved', savedAt: Date.now(), error: null });
      else setState((s) => ({ ...s, status: 'dirty' }));
      return true;
    } catch (e) {
      inflight.current = null;
      if (pending.current == null) pending.current = payload;
      else if (merge) pending.current = merge(payload, pending.current);
      setState((s) => ({ ...s, status: e.status === 409 ? 'conflict' : 'error', error: e }));
      return false;
    }
  }, [merge]);

  const schedule = useCallback((payload) => {
    pending.current = merge && pending.current ? merge(pending.current, payload) : payload;
    setState((s) => (s.status === 'conflict' ? s : { ...s, status: 'dirty' }));
    clearTimeout(timer.current);
    timer.current = setTimeout(run, delay);
  }, [delay, merge, run]);

  const discard = useCallback(() => {
    clearTimeout(timer.current);
    pending.current = null;
    setState({ status: 'saved', savedAt: Date.now(), error: null });
  }, []);

  const isDirty = useCallback(() => pending.current != null || inflight.current != null, []);

  // 分頁切到背景時立即儲存
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden' && pending.current) run(); };
    document.addEventListener('visibilitychange', onHide);
    return () => { document.removeEventListener('visibilitychange', onHide); clearTimeout(timer.current); };
  }, [run]);

  return { ...state, schedule, flush: run, retry: run, discard, isDirty };
}

// 多個自動儲存來源合併為一個顯示狀態
export function combineStatus(...list) {
  const order = ['conflict', 'error', 'saving', 'dirty', 'saved'];
  const status = order.find((s) => list.some((x) => x.status === s)) || 'saved';
  const savedAt = Math.max(0, ...list.map((x) => x.savedAt || 0)) || null;
  const error = list.find((x) => x.error)?.error;
  return { status, savedAt, error };
}
