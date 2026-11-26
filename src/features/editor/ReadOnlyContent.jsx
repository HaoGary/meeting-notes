// 唯讀內容：使用與編輯器相同的擴充，確保分享頁的呈現與編輯時一致。
import { useMemo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { createExtensions } from './extensions';

const LIST = ['bulletList', 'orderedList', 'taskList'];
const isEmptyNode = (n) => {
  if (!n) return true;
  if (n.type === 'text') return !n.text?.trim();
  if (['image', 'table', 'horizontalRule'].includes(n.type)) return false;
  return !n.content || n.content.every(isEmptyNode);
};

// 預覽時移除空白段落、空清單項目；標題下沒有內容則標示「未填寫」
export function pruneForPreview(doc) {
  if (!doc?.content) return doc;
  const clean = (nodes) => nodes
    .map((n) => (LIST.includes(n.type) ? { ...n, content: (n.content || []).filter((li) => !isEmptyNode(li)) } : n))
    .filter((n) => n.type === 'heading' || !isEmptyNode(n));
  const out = [];
  const nodes = clean(doc.content);
  nodes.forEach((n, i) => {
    out.push(n);
    const next = nodes[i + 1];
    if (n.type === 'heading' && (!next || (next.type === 'heading' && next.attrs?.level <= n.attrs?.level))) {
      out.push({ type: 'paragraph', content: [{ type: 'text', text: '（未填寫）', marks: [{ type: 'textStyle', attrs: { color: '#9ca3af' } }] }] });
    }
  });
  return { ...doc, content: out };
}

export default function ReadOnlyContent({ doc, raw = false }) {
  const extensions = useMemo(() => createExtensions({ placeholder: '' }), []);
  const content = useMemo(() => (raw ? doc : pruneForPreview(doc)), [doc, raw]);
  const editor = useEditor({
    extensions,
    content,
    editable: false,
    editorProps: { attributes: { class: 'prose readonly-prose' } },
  }, [content]);
  return <EditorContent editor={editor} />;
}
