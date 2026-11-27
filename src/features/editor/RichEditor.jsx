// 通用富文字編輯器：不含任何會議邏輯，可在其他頁面重複使用。
import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { createExtensions } from './extensions';
import Toolbar from './Toolbar';
import { Box, Paper } from '@mui/material';
import SpeechToTextPanel from '../speech/SpeechToTextPanel';
import { useSpeechToText } from '../speech/useSpeechToText';
import { tidyDoc, describeStats, DEFAULT_TIDY } from './tidy/tidyDoc';
import AiPolishDialog from '../ai-polish/AiPolishDialog';
import ManualPolishDialog from '../ai-polish/ManualPolishDialog';
import { useClaudeHost } from '../ai-polish/polishService';

export default function RichEditor({ initialContent, editable = true, onChange, onSave, onUploadImage, onError, extraExtensions = [], placeholder, speechToText = false, tidy = false, aiPolish = false, onNotify }) {
  const baseline = useRef('');
  const cb = useRef({ onChange, onSave, onUploadImage, onError });
  cb.current = { onChange, onSave, onUploadImage, onError };

  const extensions = useMemo(
    () => createExtensions({ placeholder, onSave: () => cb.current.onSave?.(), extra: extraExtensions }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const editor = useEditor({
    extensions,
    content: initialContent,
    editable,
    editorProps: {
      attributes: { class: 'prose', spellcheck: 'false' },
      // 貼上或拖曳圖片 → 走上傳流程，不把大檔塞進內容
      handlePaste: (view, event) => handleFiles(event.clipboardData?.files, event),
      handleDrop: (view, event) => handleFiles(event.dataTransfer?.files, event),
    },
    onCreate: ({ editor }) => { baseline.current = JSON.stringify(editor.getJSON()); },
    // 只在內容真的改變、且可編輯時才通知（避免表格正規化等非使用者變更觸發儲存）
    onUpdate: ({ editor, transaction }) => {
      const json = editor.getJSON();
      const s = JSON.stringify(json);
      if (s === baseline.current) return;
      baseline.current = s;
      if (!editor.isEditable) return;
      cb.current.onChange?.(json);
    },
  });

  function handleFiles(files, event) {
    const imgs = Array.from(files || []).filter((f) => f.type.startsWith('image/'));
    if (!imgs.length) return false;
    event.preventDefault();
    imgs.forEach(insertImage);
    return true;
  }

  async function insertImage(file) {
    if (!cb.current.onUploadImage) return;
    try {
      const { url } = await cb.current.onUploadImage(file);
      editorRef.current?.chain().focus().setImage({ src: url, alt: file.name }).run();
    } catch (e) {
      cb.current.onError?.(e.message || '圖片上傳失敗');
    }
  }
  const editorRef = useRef(null);
  editorRef.current = editor;

  // ── 一鍵整理：直接套用全部規則，不跳出確認；可由通知的「復原」或 Ctrl/⌘+Z 還原 ──
  const runTidy = () => {
    const ed = editorRef.current;
    if (!ed) return;
    const { stats, changed } = tidyDoc(ed.getJSON(), DEFAULT_TIDY);
    if (!changed) { onNotify?.('內容已經很整齊，不需要整理'); return; }
    ed.chain().focus().tidyDocument(DEFAULT_TIDY).run();
    const summary = describeStats(stats);
    onNotify?.(`已整理：${summary.slice(0, 3).join('、')}${summary.length > 3 ? ' 等' : ''}`, 'success',
      { label: '復原', onClick: () => editorRef.current?.chain().focus().undo().run() });
  };

  // ── AI 文案潤飾（未登入 Claude 時會在視窗中引導登入） ──
  const [aiOpen, setAiOpen] = useState(false);
  const claudeHost = useClaudeHost();

  // ── 語音輸入 ──
  const [speechOpen, setSpeechOpen] = useState(false);
  const [language, setLanguage] = useState('zh-TW');
  const speech = useSpeechToText({ language });
  const focused = useRef(false);
  useEffect(() => {
    if (!editor) return;
    const f = () => { focused.current = true; };
    editor.on('focus', f);
    return () => editor.off('focus', f);
  }, [editor]);
  // 插入辨識文字：游標位置（未點過編輯器則加在最後），不取代任何既有內容
  const insertSpeech = (text) => {
    const ed = editorRef.current;
    if (!ed || !ed.isEditable) return false;
    const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return false;
    if (focused.current) {
      const pos = ed.state.selection.to; // 有選取文字時插在選取範圍之後，不覆蓋
      const content = lines.flatMap((l, i) => (i ? [{ type: 'hardBreak' }, { type: 'text', text: l }] : [{ type: 'text', text: l }]));
      ed.chain().focus().insertContentAt(pos, content).run();
    } else {
      const end = ed.state.doc.content.size;
      ed.chain().insertContentAt(end, lines.map((l) => ({ type: 'paragraph', content: [{ type: 'text', text: l }] }))).focus('end').run();
    }
    return true;
  };
  const closeSpeech = () => { speech.reset(); setSpeechOpen(false); };
  useEffect(() => { if (!editable && speechOpen) closeSpeech(); }, [editable]); // eslint-disable-line

  // 第二個參數 false：切換唯讀時不發出 update 事件，避免誤觸自動儲存
  useEffect(() => { if (editor && editor.isEditable !== editable) editor.setEditable(editable, false); }, [editor, editable]);

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <Toolbar editor={editor} disabled={!editable} onUploadImage={insertImage} onTidy={tidy && editable ? runTidy : null}
        onAiPolish={aiPolish && editable ? () => setAiOpen(true) : null}
        speech={speechToText && editable ? {
          open: speechOpen, recording: ['starting', 'listening'].includes(speech.phase),
          onToggle: () => {
            if (!speechOpen) { setSpeechOpen(true); if (speech.phase === 'idle') speech.start(); }
            else if (speech.phase === 'listening') speech.stop();
            else if (speech.phase !== 'starting' && speech.phase !== 'finishing') closeSpeech();
          },
        } : null} />
      {/* 在 Claude 中開啟時直接呼叫 Claude；一般網站改用「複製到自己的 AI、再貼回來」的手動模式，不需要 API 金鑰 */}
      {aiPolish && editor && (() => {
        const Dlg = claudeHost ? AiPolishDialog : ManualPolishDialog;
        return <Dlg open={aiOpen} onClose={() => setAiOpen(false)} editor={editor}
          onApplied={() => onNotify?.('已套用 AI 潤飾', 'success', { label: '復原', onClick: () => editorRef.current?.chain().focus().undo().run() })} />;
      })()}
      {speechOpen && (
        <SpeechToTextPanel speech={speech} language={language} onLanguage={setLanguage} onInsert={insertSpeech} onClose={closeSpeech}
          insertHint={focused.current ? '將插入到游標位置' : '將加到內容最後'} />
      )}
      <Box sx={{ flex: 1, overflow: 'auto', bgcolor: 'background.default', p: { xs: 0, sm: 2, md: 3 }, pb: { xs: 15, md: 20 } }}>
        <Paper variant="outlined" sx={{ maxWidth: 860, mx: 'auto', minHeight: '100%', borderRadius: { xs: 0, sm: 2.5 },
          bgcolor: editable ? 'background.paper' : '#fdfdfd' }}>
          <EditorContent editor={editor} />
        </Paper>
      </Box>
    </Box>
  );
}

