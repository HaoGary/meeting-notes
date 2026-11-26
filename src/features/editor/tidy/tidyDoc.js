// 會議紀錄格式整理（純函式，不依賴編輯器，可單獨測試）
// 輸入 / 輸出皆為 Tiptap JSON；回傳 { doc, stats }。所有規則可個別開關。
export const TIDY_RULES = [
  { key: 'lists', label: '轉換清單符號', desc: '「- 」「1.」「[ ]」開頭的段落轉為清單或待辦，並合併相鄰清單' },
  { key: 'empty', label: '移除多餘空行與空白', desc: '刪除空段落、空清單項目，收合連續空白' },
  { key: 'punct', label: '統一中文標點', desc: '中文旁的 , . ? ! : ; ( ) 轉為全形標點' },
  { key: 'spacing', label: '中英文之間加空格', desc: '例：Q1日本線 → Q1 日本線（不影響連結）' },
  { key: 'sentence', label: '補上句尾標點', desc: '中文段落結尾沒有標點時補上「。」（不含標題、清單、表格）' },
  { key: 'sections', label: '依範本整理區塊', desc: '依「會議目的、討論事項、決議事項、待辦事項」排序，並補上缺少的區塊' },
];
export const DEFAULT_TIDY = Object.fromEntries(TIDY_RULES.map((r) => [r.key, true]));

const CJK = '\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff';
const isCJK = (c) => !!c && new RegExp(`[${CJK}]`).test(c);
const clone = (x) => JSON.parse(JSON.stringify(x));
const textOf = (n) => (n.type === 'text' ? n.text || '' : (n.content || []).map(textOf).join(''));
const isEmpty = (n) => {
  if (['image', 'table', 'horizontalRule'].includes(n.type)) return false;
  if (n.type === 'text') return !n.text.trim();
  if (n.type === 'hardBreak') return true;
  return !(n.content || []).some((c) => !isEmpty(c));
};
const LIST_TYPES = ['bulletList', 'orderedList', 'taskList'];
const skipMarks = (n) => (n.marks || []).some((m) => m.type === 'link' || m.type === 'code');

export const SECTIONS = [
  { key: 'purpose', title: '會議目的', re: /目的|目標|背景/ },
  { key: 'discussion', title: '討論事項', re: /討論|議題|議程/ },
  { key: 'decision', title: '決議事項', re: /決議|結論|決定/ },
  { key: 'todo', title: '待辦事項', re: /待辦|行動項目|todo|action\s*items?/i },
];

// ── 1. 段落開頭的清單符號 → 清單 ──
const MARKERS = [
  { type: 'taskList', re: /^\s*(?:\[( |x|X)\]|([☐□])|([☑☒✓✔]))\s*/, checked: (m) => !!(m[1] && m[1] !== ' ') || !!m[3] },
  { type: 'orderedList', re: /^\s*(?:\d{1,3}[.、)）]|[（(]\d{1,3}[)）])\s*/ },
  { type: 'bulletList', re: /^\s*[-*•・●▪‧]\s+/ },
];
function stripLeading(para, len) {
  const p = clone(para);
  let left = len;
  p.content = (p.content || []).map((n) => {
    if (left <= 0 || n.type !== 'text') return n;
    const cut = Math.min(left, n.text.length); left -= cut;
    return { ...n, text: n.text.slice(cut) };
  }).filter((n) => n.type !== 'text' || n.text);
  return p;
}
function convertLists(nodes, stats) {
  const out = [];
  for (const n of nodes) {
    if (n.type === 'paragraph' && n.content?.length) {
      const t = textOf(n);
      const mk = MARKERS.find((m) => m.re.test(t));
      if (mk) {
        const m = t.match(mk.re);
        const para = stripLeading(n, m[0].length);
        const item = mk.type === 'taskList'
          ? { type: 'taskItem', attrs: { checked: mk.checked(m) }, content: [para] }
          : { type: 'listItem', content: [para] };
        const prev = out[out.length - 1];
        if (prev && prev.type === mk.type && prev._made) prev.content.push(item);
        else out.push({ type: mk.type, _made: true, content: [item] });
        stats.lists++;
        continue;
      }
    }
    out.push(n);
  }
  return out.map((n) => { delete n._made; return n; });
}

// ── 2. 移除空段落、空清單項目 ──
function removeEmpty(nodes, stats, top) {
  const out = [];
  nodes.forEach((n, i) => {
    if (LIST_TYPES.includes(n.type)) {
      const items = (n.content || []).filter((it) => {
        const keep = !isEmpty(it);
        if (!keep) stats.empty++;
        return keep;
      }).map((it) => ({ ...it, content: removeEmpty(it.content || [], stats, false) }));
      if (items.length) out.push({ ...n, content: items });
      return;
    }
    if (n.type === 'paragraph' && isEmpty(n)) {
      // 標題下方唯一的空段落保留（作為輸入位置）
      const prev = nodes[i - 1], next = nodes[i + 1];
      if (top && prev?.type === 'heading' && (!next || next.type === 'heading')) { out.push(n); return; }
      if (!top && out.length === 0 && i === nodes.length - 1) { out.push(n); return; }
      stats.empty++;
      return;
    }
    if (n.type === 'blockquote') { out.push({ ...n, content: removeEmpty(n.content || [], stats, false) }); return; }
    out.push(n);
  });
  return out;
}
// 合併相鄰的同類型清單
function mergeLists(nodes, stats) {
  const out = [];
  for (const n of nodes) {
    const prev = out[out.length - 1];
    if (prev && LIST_TYPES.includes(n.type) && prev.type === n.type && (n.type !== 'orderedList' || (n.attrs?.start ?? 1) === 1)) {
      prev.content = [...prev.content, ...n.content]; stats.merged++;
    } else out.push(n);
  }
  return out;
}

// ── 3. 行內文字：空白、標點、中英間距 ──
const P = { ',': '，', ';': '；', ':': '：', '?': '？', '!': '！' };
function fixText(s, prev, next, opts, stats) {
  let t = s;
  const count = (re, rep) => { t = t.replace(re, (...a) => { const r = typeof rep === 'function' ? rep(...a) : rep; if (r !== a[0]) stats.text++; return r; }); };
  if (opts.empty) {
    // 中文字之間的連續空白多半是貼上或語音稿造成，直接移除；單一空白可能是刻意分隔，保留
    count(new RegExp(`(?<=[${CJK}])[ \\t\\u00a0]{2,}(?=[${CJK}])`, 'g'), '');
    count(/[ \t\u00a0]{2,}/g, ' ');
  }
  if (opts.punct) {
    const ctx = (prev || '') + t + (next || '');
    let r = ctx;
    r = r.replace(new RegExp(`\\(([^()]*[${CJK}][^()]*)\\)`, 'g'), (m, x) => { stats.text++; return `（${x}）`; });
    r = r.replace(new RegExp(`(?<=[${CJK}）」』])\\s*([,;:?!])\\s*|\\s*([,;:?!])\\s*(?=[${CJK}（「『])`, 'g'), (m, a, b) => { stats.text++; return P[a || b]; });
    r = r.replace(new RegExp(`(?<=[${CJK}])\\.(?=$|\\s|[${CJK}])`, 'g'), () => { stats.text++; return '。'; });
    r = r.replace(/\s*([，。！？：；、（）「」『』])\s*/g, (m, x) => { if (m !== x) stats.text++; return x; });
    t = r.slice(prev ? 1 : 0, next ? r.length - 1 : r.length);
    // 邊界字元若被改寫（極少見）則還原本段，以免影響相鄰節點
    if ((prev && r[0] !== prev) || (next && r[r.length - 1] !== next)) t = s;
  }
  if (opts.spacing) {
    const ctx = (prev || '') + t;
    let r = ctx.replace(new RegExp(`([${CJK}])([A-Za-z0-9@#&])`, 'g'), (m, a, b) => { stats.spacing++; return `${a} ${b}`; })
      .replace(new RegExp(`([A-Za-z0-9%&])([${CJK}])`, 'g'), (m, a, b) => { stats.spacing++; return `${a} ${b}`; });
    t = prev ? r.slice(1) : r;
  }
  return t;
}
function fixInline(node, opts, stats) {
  if (!node.content) return node;
  if (node.type === 'codeBlock') return node;
  const kids = node.content;
  const isTextBlock = kids.some((k) => k.type === 'text');
  if (!isTextBlock) return { ...node, content: kids.map((k) => fixInline(k, opts, stats)) };
  const out = kids.map((k, i) => {
    if (k.type !== 'text' || skipMarks(k)) return k;
    const prevNode = kids[i - 1], nextNode = kids[i + 1];
    const prev = prevNode?.type === 'text' ? prevNode.text.slice(-1) : '';
    const next = nextNode?.type === 'text' ? nextNode.text[0] : '';
    return { ...k, text: fixText(k.text, prev, next, opts, stats) };
  });
  if (opts.empty) { // 段落頭尾空白
    const first = out.find((k) => k.type === 'text'), last = [...out].reverse().find((k) => k.type === 'text');
    if (first && !skipMarks(first) && /^\s/.test(first.text)) { first.text = first.text.replace(/^\s+/, ''); stats.text++; }
    if (last && !skipMarks(last) && /\s$/.test(last.text)) { last.text = last.text.replace(/\s+$/, ''); stats.text++; }
  }
  return { ...node, content: out.filter((k) => k.type !== 'text' || k.text) };
}

// ── 4. 句尾標點（僅頂層段落） ──
function addSentenceEnd(n, stats) {
  if (n.type !== 'paragraph' || !n.content?.length) return n;
  const t = textOf(n).trim();
  if (t.length < 6 || !isCJK(t.slice(-1))) return n;
  const kids = clone(n.content);
  const last = [...kids].reverse().find((k) => k.type === 'text');
  if (!last || skipMarks(last)) return n;
  last.text = last.text.replace(/\s*$/, '。');
  stats.sentence++;
  return { ...n, content: kids };
}

// ── 5. 依範本排序區塊 ──
function organizeSections(nodes, stats) {
  const blocks = []; let cur = { heading: null, body: [] };
  for (const n of nodes) {
    if (n.type === 'heading' && (n.attrs?.level ?? 1) <= 2) { blocks.push(cur); cur = { heading: n, body: [] }; }
    else cur.body.push(n);
  }
  blocks.push(cur);
  const preamble = blocks.shift();
  const found = {}; const others = [];
  for (const b of blocks) {
    const title = textOf(b.heading).trim();
    const s = SECTIONS.find((x) => x.re.test(title) && !found[x.key]);
    if (s) found[s.key] = b; else others.push(b);
  }
  const ordered = [];
  SECTIONS.forEach((s) => {
    if (found[s.key]) {
      const h = found[s.key].heading;
      if ((h.attrs?.level ?? 1) !== 2) { stats.sectionsFixed++; }
      ordered.push({ heading: { ...h, attrs: { ...h.attrs, level: 2 } }, body: found[s.key].body });
    } else {
      stats.sectionsAdded++;
      ordered.push({ heading: { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: s.title }] }, body: [{ type: 'paragraph' }] });
    }
  });
  const result = [...ordered, ...others];
  // 原有區塊的相對順序是否改變
  const finalOriginals = [...SECTIONS.filter((x) => found[x.key]).map((x) => found[x.key]), ...others];
  if (blocks.some((b, i) => b !== finalOriginals[i])) stats.sectionsMoved = true;
  return [...preamble.body, ...result.flatMap((b) => [b.heading, ...(b.body.length ? b.body : [{ type: 'paragraph' }])])];
}

export function tidyDoc(doc, opts = DEFAULT_TIDY) {
  const stats = { lists: 0, merged: 0, empty: 0, text: 0, spacing: 0, sentence: 0, sectionsAdded: 0, sectionsFixed: 0, sectionsMoved: false };
  let nodes = clone(doc.content || []);
  if (opts.lists) nodes = convertLists(nodes, stats);
  if (opts.empty) nodes = removeEmpty(nodes, stats, true);
  if (opts.lists || opts.empty) nodes = mergeLists(nodes, stats);
  if (opts.punct || opts.spacing || opts.empty) nodes = nodes.map((n) => fixInline(n, opts, stats));
  if (opts.sentence) nodes = nodes.map((n) => addSentenceEnd(n, stats));
  if (opts.sections) nodes = organizeSections(nodes, stats);
  if (!nodes.length) nodes = [{ type: 'paragraph' }];
  const out = { ...doc, content: nodes };
  return { doc: out, stats, changed: JSON.stringify(out) !== JSON.stringify(doc) };
}

// 變更摘要文字
export function describeStats(s) {
  return [
    s.lists && `轉換 ${s.lists} 個清單項目`,
    s.merged && `合併 ${s.merged} 個相鄰清單`,
    s.empty && `移除 ${s.empty} 個空行`,
    s.text && `修正 ${s.text} 處標點與空白`,
    s.spacing && `加入 ${s.spacing} 處中英文間距`,
    s.sentence && `補上 ${s.sentence} 處句尾標點`,
    s.sectionsMoved && '調整區塊順序',
    s.sectionsAdded && `補上 ${s.sectionsAdded} 個缺少的區塊`,
    s.sectionsFixed && `統一 ${s.sectionsFixed} 個區塊標題層級`,
  ].filter(Boolean);
}
