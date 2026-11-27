// Tiptap 文件 ⇄ AI 用的精簡結構。
// 只把文字段落送給 AI；表格、圖片等以 { type:'keep', ref } 佔位，改寫後原樣放回，不會被 AI 更動。
const textOf = (n) => (n.type === 'text' ? n.text || '' : n.type === 'hardBreak' ? '\n' : (n.content || []).map(textOf).join(''));
const isSectionHeading = (n) => n.type === 'heading' && (n.attrs?.level ?? 1) <= 2;
const KEEP = ['table', 'image', 'horizontalRule', 'codeBlock'];

export function toSections(doc) {
  const sections = []; const keeps = {};
  let cur = { index: 0, heading: null, headingNode: null, blocks: [] };
  let k = 0;
  const pushBlock = (b) => { if (b.type === 'keep' || (b.text && b.text.trim())) cur.blocks.push(b); };
  for (const n of doc.content || []) {
    if (isSectionHeading(n)) {
      sections.push(cur);
      cur = { index: sections.length, heading: textOf(n).trim(), headingNode: n, blocks: [] };
      continue;
    }
    if (KEEP.includes(n.type)) { const ref = `k${++k}`; keeps[ref] = n; pushBlock({ type: 'keep', ref }); continue; }
    if (n.type === 'heading') { pushBlock({ type: 'subheading', text: textOf(n).trim() }); continue; }
    if (n.type === 'bulletList' || n.type === 'orderedList') {
      (n.content || []).forEach((li) => pushBlock({ type: n.type === 'bulletList' ? 'bullet' : 'ordered', text: textOf(li).trim() }));
      continue;
    }
    if (n.type === 'taskList') {
      (n.content || []).forEach((li) => pushBlock({ type: 'task', text: textOf(li).trim(), checked: !!li.attrs?.checked }));
      continue;
    }
    pushBlock({ type: 'paragraph', text: textOf(n).trim() });
  }
  sections.push(cur);
  return { sections, keeps };
}

// 傳給 AI 的內容（不含原始節點）
// all=true（分類模式）：空白的標題區塊也要傳，AI 才知道可以把內容放到哪裡
export const sectionsPayload = (sections, { all = false } = {}) => sections
  .filter((s) => s.blocks.length || (all && s.headingNode))
  .map((s) => ({ index: s.index, heading: s.heading, blocks: s.blocks }));

// 分類模式可新增的標準區塊（文件裡沒有時才新增，放在最後）
export const STANDARD_SECTIONS = ['會議目的', '討論事項', '決議事項', '待辦事項'];

// 文字 → 段落內容：網址自動轉為連結
const URL_RE = /(https?:\/\/[^\s，。、；）」]+)/g;
function inline(text) {
  const out = [];
  String(text).split('\n').forEach((line, li) => {
    if (li) out.push({ type: 'hardBreak' });
    line.split(URL_RE).forEach((part, i) => {
      if (!part) return;
      out.push(i % 2 ? { type: 'text', text: part, marks: [{ type: 'link', attrs: { href: part } }] } : { type: 'text', text: part });
    });
  });
  return out;
}
const para = (text) => ({ type: 'paragraph', content: inline(text) });

function blocksToNodes(blocks, keeps, used) {
  const nodes = [];
  const listOf = { bullet: 'bulletList', ordered: 'orderedList', task: 'taskList' };
  for (const b of blocks) {
    if (!b || typeof b !== 'object') continue;
    if (b.type === 'keep') { if (keeps[b.ref] && !used.has(b.ref)) { nodes.push(keeps[b.ref]); used.add(b.ref); } continue; }
    const text = typeof b.text === 'string' ? b.text.trim() : '';
    if (!text) continue;
    if (b.type === 'subheading') { nodes.push({ type: 'heading', attrs: { level: 3 }, content: inline(text) }); continue; }
    const lt = listOf[b.type];
    if (lt) {
      const item = lt === 'taskList' ? { type: 'taskItem', attrs: { checked: !!b.checked }, content: [para(text)] } : { type: 'listItem', content: [para(text)] };
      const last = nodes[nodes.length - 1];
      if (last && last.type === lt && last._ai) last.content.push(item);
      else nodes.push({ type: lt, _ai: true, content: [item] });
      continue;
    }
    nodes.push(para(text));
  }
  return nodes.map((n) => { delete n._ai; return n; });
}

// 依 AI 結果重建文件；AI 缺漏或格式不符的區塊保留原文，確保不會遺失內容
// classify=true（分類模式）：AI 可以把內容移到其他區塊、回傳空陣列清空區塊，也可新增標準區塊；
// 表格與圖片一律留在原本的區塊，不跟著移動。
export function fromSections(doc, parsed, result, { classify = false } = {}) {
  const { sections, keeps } = parsed;
  const byIndex = new Map((result?.sections || []).filter((s) => Number.isInteger(s?.index) && Array.isArray(s.blocks)).map((s) => [s.index, s.blocks]));
  const home = {}; sections.forEach((s) => s.blocks.forEach((b) => { if (b.type === 'keep') home[b.ref] = s.index; }));
  const original = splitOriginal(doc);
  const used = new Set();
  const out = []; let kept = 0;
  sections.forEach((s, i) => {
    if (s.headingNode) out.push(s.headingNode);
    let blocks = byIndex.get(s.index);
    if (!blocks || (!classify && !s.blocks.length)) { out.push(...original[i]); if (s.blocks.length) kept++; return; }
    if (classify) blocks = blocks.filter((b) => b?.type !== 'keep' || home[b.ref] === s.index);
    const nodes = blocksToNodes(blocks, keeps, used);
    // AI 遺漏的表格／圖片補回區塊最後
    s.blocks.filter((b) => b.type === 'keep' && !used.has(b.ref)).forEach((b) => { nodes.push(keeps[b.ref]); used.add(b.ref); });
    if (nodes.length) out.push(...nodes);
    else if (!classify) out.push(...original[i]);
    else if (s.headingNode) out.push({ type: 'paragraph' }); // 內容都分類到其他區塊後，留一個空段落方便輸入
  });
  if (classify && Array.isArray(result?.newSections)) {
    const existing = new Set(sections.map((s) => s.heading));
    for (const ns of result.newSections) {
      const heading = typeof ns?.heading === 'string' ? ns.heading.trim() : '';
      if (!STANDARD_SECTIONS.includes(heading) || existing.has(heading) || !Array.isArray(ns.blocks)) continue;
      const nodes = blocksToNodes(ns.blocks.filter((b) => b?.type !== 'keep'), keeps, used);
      if (!nodes.length) continue;
      existing.add(heading);
      out.push({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: heading }] }, ...nodes);
    }
  }
  return { doc: { ...doc, content: out.length ? out : [{ type: 'paragraph' }] }, keptSections: kept };
}

// 安全檢查：原文中的數字（日期、金額、百分比、時間等）在結果裡找不到時列出來，提醒使用者確認
const allText = (n) => (n.type === 'text' ? n.text || '' : (n.content || []).map(allText).join(' '));
export function missingNumbers(before, after) {
  const nums = (doc) => (allText(doc).match(/\d+(?:[.:/,]\d+)*%?/g) || []);
  const a = nums(after); const pool = new Map(); a.forEach((x) => pool.set(x, (pool.get(x) || 0) + 1));
  const missing = [];
  for (const x of new Set(nums(before))) if (!pool.has(x)) missing.push(x);
  return missing;
}

function splitOriginal(doc) {
  const parts = [[]];
  for (const n of doc.content || []) { if (isSectionHeading(n)) parts.push([]); else parts[parts.length - 1].push(n); }
  return parts;
}
