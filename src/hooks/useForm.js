// 可重複使用的表單狀態與驗證 hook
// - 使用者輸入過的欄位，離開（blur）後才開始顯示錯誤，之後輸入時即時更新
// - 尚未輸入過的欄位不在 blur 時報錯（避免點其他連結時版面跳動、誤觸），送出時才全部檢查
// - 送出時驗證全部欄位並聚焦第一個錯誤
// - 可寫入後端回傳的欄位錯誤（setFieldError）；該錯誤會保留到使用者修改此欄位為止
import { useCallback, useRef, useState } from 'react';
import { validateAll, validateField } from '../utils/validators';

export function useForm(initial, schema, { dependents = {} } = {}) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const refs = useRef({});
  const dirty = useRef({});
  const submitted = useRef(false);
  const serverErr = useRef({}); // name -> 出錯時的值
  const valuesRef = useRef(values);
  valuesRef.current = values;

  const revalidate = (names, vals, force) => {
    setErrors((prev) => {
      const next = { ...prev };
      names.forEach((n) => { if (force || touched[n]) next[n] = validateField(schema, n, vals); });
      return next;
    });
  };

  const setValue = useCallback((name, value) => {
    dirty.current[name] = true;
    delete serverErr.current[name];
    const vals = { ...valuesRef.current, [name]: value };
    valuesRef.current = vals;
    setValues(vals);
    revalidate([name, ...(dependents[name] || [])], vals);
  }, [touched]); // eslint-disable-line

  const onBlur = (name) => {
    if (!dirty.current[name] && !submitted.current) return;
    if (name in serverErr.current && serverErr.current[name] === valuesRef.current[name]) return; // 保留後端錯誤
    setTouched((t) => ({ ...t, [name]: true }));
    setErrors((prev) => ({ ...prev, [name]: validateField(schema, name, valuesRef.current) }));
  };

  // TextField 用的 props
  const field = (name, { helper } = {}) => ({
    name,
    value: values[name] ?? '',
    onChange: (e) => setValue(name, e.target.type === 'checkbox' ? e.target.checked : e.target.value),
    onBlur: () => onBlur(name),
    error: !!errors[name],
    helperText: errors[name] || helper || '',
    inputRef: (el) => { refs.current[name] = el; },
  });

  const setFieldError = (name, msg) => {
    serverErr.current[name] = valuesRef.current[name];
    setTouched((t) => ({ ...t, [name]: true }));
    setErrors((e) => ({ ...e, [name]: msg }));
    setTimeout(() => refs.current[name]?.focus?.(), 0);
  };

  const handleSubmit = (fn) => async (e) => {
    e?.preventDefault?.();
    if (submitting) return;
    submitted.current = true;
    const errs = validateAll(schema, valuesRef.current);
    setTouched(Object.fromEntries(Object.keys(schema).map((k) => [k, true])));
    setErrors(errs);
    const first = Object.keys(schema).find((k) => errs[k]);
    if (first) { refs.current[first]?.focus?.(); return; }
    setSubmitting(true);
    try { await fn(valuesRef.current); } finally { setSubmitting(false); }
  };

  const reset = (next = initial) => { setValues(next); valuesRef.current = next; setErrors({}); setTouched({}); dirty.current = {}; submitted.current = false; serverErr.current = {}; };

  return { values, errors, touched, submitting, setValue, setValues, field, setFieldError, handleSubmit, reset, onBlur };
}
