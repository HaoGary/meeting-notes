// 編輯器工具列（MUI）。只依賴 editor 實例，可在任何頁面重複使用。
import { useState } from 'react';
import {
  Box, Divider, IconButton, MenuItem, Popover, Select, Stack, Tooltip, Typography, TextField, Button, Chip,
} from '@mui/material';
import FormatBold from '@mui/icons-material/FormatBold';
import FormatItalic from '@mui/icons-material/FormatItalic';
import FormatUnderlined from '@mui/icons-material/FormatUnderlined';
import StrikethroughS from '@mui/icons-material/StrikethroughS';
import FormatListBulleted from '@mui/icons-material/FormatListBulleted';
import FormatListNumbered from '@mui/icons-material/FormatListNumbered';
import Checklist from '@mui/icons-material/Checklist';
import ImageOutlined from '@mui/icons-material/ImageOutlined';
import TableChartOutlined from '@mui/icons-material/TableChartOutlined';
import LinkIcon from '@mui/icons-material/Link';
import FormatAlignLeft from '@mui/icons-material/FormatAlignLeft';
import FormatAlignCenter from '@mui/icons-material/FormatAlignCenter';
import FormatAlignRight from '@mui/icons-material/FormatAlignRight';
import FormatAlignJustify from '@mui/icons-material/FormatAlignJustify';
import Undo from '@mui/icons-material/Undo';
import Redo from '@mui/icons-material/Redo';
import FormatQuote from '@mui/icons-material/FormatQuote';
import FormatClear from '@mui/icons-material/FormatClear';
import KeyboardOutlined from '@mui/icons-material/KeyboardOutlined';
import MicNoneOutlined from '@mui/icons-material/MicNoneOutlined';
import MicRounded from '@mui/icons-material/MicRounded';
import AutoFixHighOutlined from '@mui/icons-material/AutoFixHighOutlined';
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';

const COLORS = ['#111827', '#6b7280', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#db2777'];
const SIZES = ['12px', '14px', '16px', '18px', '20px', '24px', '30px'];
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl';
const ALIGN = { left: FormatAlignLeft, center: FormatAlignCenter, right: FormatAlignRight, justify: FormatAlignJustify };

export const SHORTCUTS = [
  ['粗體', `${mod} B`], ['斜體', `${mod} I`], ['底線', `${mod} U`], ['刪除線', `${mod} Shift S`],
  ['標題 1 / 2 / 3', `${mod} Alt 1/2/3`], ['無序清單', `${mod} Shift 8`], ['有序清單', `${mod} Shift 7`],
  ['待辦清單', `${mod} Shift 9`], ['靠左 / 置中 / 靠右', `${mod} Shift L/E/R`], ['復原', `${mod} Z`],
  ['重做', `${mod} Shift Z`], ['立即儲存', `${mod} S`], ['複製 / 貼上', `${mod} C / V`],
];

function Btn({ icon: I, title, active, disabled, onClick, children }) {
  return (
    <Tooltip title={title}>
      <span>
        <IconButton size="small" aria-label={title} aria-pressed={active || undefined} disabled={disabled}
          onMouseDown={(e) => e.preventDefault()} onClick={onClick}
          sx={{ borderRadius: 1.5, color: active ? 'primary.dark' : 'text.secondary', bgcolor: active ? 'primary.light' : 'transparent',
            '&:hover': { bgcolor: active ? 'primary.light' : 'action.hover' } }}>
          {I ? <I fontSize="small" /> : children}
        </IconButton>
      </span>
    </Tooltip>
  );
}
const Sep = () => <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.75 }} />;
const selSx = { height: 32, fontSize: 13.5, '.MuiOutlinedInput-notchedOutline': { border: 0 }, '&:hover': { bgcolor: 'action.hover' } };

export default function Toolbar({ editor, onUploadImage, disabled, speech, onTidy, onAiPolish }) {
  const [anchor, setAnchor] = useState(null); // { el, name }
  const [linkUrl, setLinkUrl] = useState('');
  if (!editor) return <Box sx={{ minHeight: 48, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }} />;

  const can = !disabled && editor.isEditable;
  const c = () => editor.chain().focus();
  const open = (name) => (e) => setAnchor({ el: e.currentTarget, name });
  const close = () => setAnchor(null);
  const is = (n) => anchor?.name === n;

  const heading = [1, 2, 3].find((l) => editor.isActive('heading', { level: l })) || 0;
  const fontSize = editor.getAttributes('textStyle').fontSize || '';
  const color = editor.getAttributes('textStyle').color || '';
  const align = ['center', 'right', 'justify'].find((a) => editor.isActive({ textAlign: a })) || 'left';
  const AlignIcon = ALIGN[align];
  const inTable = editor.isActive('table');

  const applyLink = (e) => {
    e.preventDefault();
    let url = linkUrl.trim();
    if (!url) { c().extendMarkRange('link').unsetLink().run(); close(); return; }
    if (!/^(https?:|mailto:|tel:)/i.test(url)) url = 'https://' + url;
    if (editor.state.selection.empty && !editor.isActive('link')) {
      c().insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href: url } }] }).run();
    } else c().extendMarkRange('link').setLink({ href: url }).run();
    close();
  };

  const pickImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/gif,image/webp';
    input.onchange = () => { const f = input.files?.[0]; if (f) onUploadImage?.(f); };
    input.click();
  };

  const tableActions = [
    ['上方插入列', () => c().addRowBefore().run()], ['下方插入列', () => c().addRowAfter().run()],
    ['左側插入欄', () => c().addColumnBefore().run()], ['右側插入欄', () => c().addColumnAfter().run()],
    ['刪除列', () => c().deleteRow().run()], ['刪除欄', () => c().deleteColumn().run()],
    ['合併/分割', () => c().mergeOrSplit().run()], ['標題列', () => c().toggleHeaderRow().run()],
  ];

  return (
    <Box role="toolbar" aria-label="文字格式"
      sx={{ position: 'relative', zIndex: 2, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider', px: { xs: 1, md: 2 }, py: 0.5 }}>
      <Stack direction="row" alignItems="center" flexWrap="wrap" rowGap={0.25}>
        <Btn icon={Undo} title={`復原 (${mod} Z)`} disabled={!can || !editor.can().undo()} onClick={() => c().undo().run()} />
        <Btn icon={Redo} title={`重做 (${mod} Shift Z)`} disabled={!can || !editor.can().redo()} onClick={() => c().redo().run()} />
        <Sep />
        <Select value={heading} disabled={!can} sx={{ ...selSx, minWidth: 86 }} inputProps={{ 'aria-label': '段落樣式' }}
          onChange={(e) => { const l = +e.target.value; l ? c().setHeading({ level: l }).run() : c().setParagraph().run(); }}>
          <MenuItem value={0}>內文</MenuItem>
          <MenuItem value={1} sx={{ fontSize: 20, fontWeight: 700 }}>標題 1</MenuItem>
          <MenuItem value={2} sx={{ fontSize: 17, fontWeight: 650 }}>標題 2</MenuItem>
          <MenuItem value={3} sx={{ fontSize: 15, fontWeight: 650 }}>標題 3</MenuItem>
        </Select>
        <Select value={fontSize} displayEmpty disabled={!can} sx={{ ...selSx, minWidth: 64 }} inputProps={{ 'aria-label': '字體大小' }}
          renderValue={(v) => (v ? parseInt(v) : '字級')}
          onChange={(e) => (e.target.value ? c().setFontSize(e.target.value).run() : c().unsetFontSize().run())}>
          <MenuItem value="">預設</MenuItem>
          {SIZES.map((s) => <MenuItem key={s} value={s}>{parseInt(s)}</MenuItem>)}
        </Select>
        <Sep />
        <Btn icon={FormatBold} title={`粗體 (${mod} B)`} active={editor.isActive('bold')} disabled={!can} onClick={() => c().toggleBold().run()} />
        <Btn icon={FormatItalic} title={`斜體 (${mod} I)`} active={editor.isActive('italic')} disabled={!can} onClick={() => c().toggleItalic().run()} />
        <Btn icon={FormatUnderlined} title={`底線 (${mod} U)`} active={editor.isActive('underline')} disabled={!can} onClick={() => c().toggleUnderline().run()} />
        <Btn icon={StrikethroughS} title={`刪除線 (${mod} Shift S)`} active={editor.isActive('strike')} disabled={!can} onClick={() => c().toggleStrike().run()} />
        <Btn title="文字顏色" active={is('color')} disabled={!can} onClick={open('color')}>
          <Box sx={{ width: 20, height: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <Box component="span" sx={{ fontWeight: 700, fontSize: 15, lineHeight: 1 }}>A</Box>
            <Box sx={{ width: 14, height: 3, mt: '2px', borderRadius: 1, bgcolor: color || '#111827' }} />
          </Box>
        </Btn>
        <Sep />
        <Btn icon={FormatListBulleted} title={`無序清單 (${mod} Shift 8)`} active={editor.isActive('bulletList')} disabled={!can} onClick={() => c().toggleBulletList().run()} />
        <Btn icon={FormatListNumbered} title={`有序清單 (${mod} Shift 7)`} active={editor.isActive('orderedList')} disabled={!can} onClick={() => c().toggleOrderedList().run()} />
        <Btn icon={Checklist} title={`待辦清單 (${mod} Shift 9)`} active={editor.isActive('taskList')} disabled={!can} onClick={() => c().toggleTaskList().run()} />
        <Btn icon={AlignIcon} title="對齊方式" active={is('align')} disabled={!can} onClick={open('align')} />
        <Sep />
        <Btn icon={LinkIcon} title="超連結" active={editor.isActive('link') || is('link')} disabled={!can}
          onClick={(e) => { setLinkUrl(editor.getAttributes('link').href || ''); open('link')(e); }} />
        <Btn icon={ImageOutlined} title="插入圖片" disabled={!can} onClick={pickImage} />
        <Btn icon={TableChartOutlined} title="插入表格" active={inTable} disabled={!can}
          onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
        <Btn icon={FormatQuote} title="引言" active={editor.isActive('blockquote')} disabled={!can} onClick={() => c().toggleBlockquote().run()} />
        <Btn icon={FormatClear} title="清除格式" disabled={!can} onClick={() => c().unsetAllMarks().clearNodes().run()} />
        <Box flex={1} />
        {onTidy && (
          <Tooltip title="一鍵整理：清單、空行、標點、中英間距、區塊順序（可復原）">
            <span>
              <Button size="small" onMouseDown={(e) => e.preventDefault()} onClick={onTidy} disabled={!can} aria-label="整理紀錄"
                startIcon={<AutoFixHighOutlined fontSize="small" />}
                sx={{ mr: 0.5, height: 30, px: 1.25, borderRadius: 1.5, fontWeight: 600, fontSize: 13, color: 'text.secondary', '&:hover': { bgcolor: 'action.hover' } }}>
                整理
              </Button>
            </span>
          </Tooltip>
        )}
        {onAiPolish && (
          <Tooltip title="AI 文案潤飾：口語改書面、精簡為條列重點（預覽後套用）">
            <span>
              <Button size="small" onMouseDown={(e) => e.preventDefault()} onClick={onAiPolish} disabled={!can} aria-label="AI 潤飾"
                startIcon={<AutoAwesomeOutlined fontSize="small" />}
                sx={{ mr: 0.5, height: 30, px: 1.25, borderRadius: 1.5, fontWeight: 600, fontSize: 13, color: 'primary.main', '&:hover': { bgcolor: 'primary.light' } }}>
                AI 潤飾
              </Button>
            </span>
          </Tooltip>
        )}
        {speech && (
          <Tooltip title={speech.recording ? '錄音中（點擊開啟面板）' : '語音輸入'}>
            <span>
              <Button size="small" onMouseDown={(e) => e.preventDefault()} onClick={speech.onToggle} disabled={!can}
                aria-pressed={speech.open} aria-label="語音輸入"
                startIcon={speech.recording ? <MicRounded fontSize="small" /> : <MicNoneOutlined fontSize="small" />}
                sx={{ mr: 0.5, height: 30, px: 1.25, borderRadius: 1.5, fontWeight: 600, fontSize: 13,
                  color: speech.recording ? '#fff' : speech.open ? 'primary.dark' : 'text.secondary',
                  bgcolor: speech.recording ? 'error.main' : speech.open ? 'primary.light' : 'transparent',
                  '&:hover': { bgcolor: speech.recording ? 'error.dark' : speech.open ? 'primary.light' : 'action.hover' } }}>
                {speech.recording ? '錄音中' : '語音輸入'}
              </Button>
            </span>
          </Tooltip>
        )}
        <Btn icon={KeyboardOutlined} title="鍵盤快捷鍵" active={is('keys')} onClick={open('keys')} />
      </Stack>

      {inTable && can && (
        <Stack direction="row" alignItems="center" flexWrap="wrap" gap={0.5} sx={{ pt: 0.75, mt: 0.5, borderTop: '1px dashed', borderColor: 'divider' }}>
          <Chip size="small" icon={<TableChartOutlined />} label="表格" variant="outlined" sx={{ mr: 0.5 }} />
          {tableActions.map(([label, fn]) => (
            <Button key={label} size="small" color="inherit" onMouseDown={(e) => e.preventDefault()} onClick={fn}
              sx={{ fontWeight: 500, color: 'text.secondary', minWidth: 0, px: 1 }}>{label}</Button>
          ))}
          <Button size="small" color="error" onMouseDown={(e) => e.preventDefault()} onClick={() => c().deleteTable().run()} sx={{ fontWeight: 500 }}>刪除表格</Button>
        </Stack>
      )}

      {/* 顏色 */}
      <Popover open={is('color')} anchorEl={anchor?.el} onClose={close} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        disableRestoreFocus slotProps={{ paper: { sx: { p: 1.25, mt: 0.5 } } }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, 24px)', gap: 0.75 }}>
          {COLORS.map((col) => (
            <Box key={col} component="button" type="button" title={col} onMouseDown={(e) => e.preventDefault()}
              onClick={() => { c().setColor(col).run(); close(); }}
              sx={{ width: 24, height: 24, borderRadius: 1, bgcolor: col, border: 0, cursor: 'pointer',
                boxShadow: color === col ? (t) => `0 0 0 2px #fff, 0 0 0 4px ${t.palette.primary.main}` : 'inset 0 0 0 1px rgba(0,0,0,.1)' }} />
          ))}
        </Box>
        <Button size="small" fullWidth sx={{ mt: 1, justifyContent: 'flex-start', color: 'text.secondary' }}
          onClick={() => { c().unsetColor().run(); close(); }}>清除顏色</Button>
      </Popover>

      {/* 對齊 */}
      <Popover open={is('align')} anchorEl={anchor?.el} onClose={close} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        disableRestoreFocus slotProps={{ paper: { sx: { p: 0.5, mt: 0.5 } } }}>
        <Stack direction="row">
          {[['left', '靠左'], ['center', '置中'], ['right', '靠右'], ['justify', '左右對齊']].map(([a, label]) => (
            <Btn key={a} icon={ALIGN[a]} title={label} active={align === a} onClick={() => { c().setTextAlign(a).run(); close(); }} />
          ))}
        </Stack>
      </Popover>

      {/* 連結 */}
      <Popover open={is('link')} anchorEl={anchor?.el} onClose={close} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { sx: { p: 1.25, mt: 0.5 } } }}>
        <Stack component="form" direction="row" gap={1} onSubmit={applyLink} sx={{ width: 340 }}>
          <TextField autoFocus fullWidth placeholder="https://" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
          <Button type="submit" variant="contained">套用</Button>
          {editor.isActive('link') && (
            <Button color="inherit" onClick={() => { c().extendMarkRange('link').unsetLink().run(); close(); }}>移除</Button>
          )}
        </Stack>
      </Popover>

      {/* 快捷鍵 */}
      <Popover open={is('keys')} anchorEl={anchor?.el} onClose={close} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }} slotProps={{ paper: { sx: { p: 1.5, mt: 0.5, width: 280 } } }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>鍵盤快捷鍵</Typography>
        {SHORTCUTS.map(([k, v]) => (
          <Stack key={k} direction="row" justifyContent="space-between" sx={{ py: 0.4, fontSize: 13, color: 'text.secondary' }}>
            <span>{k}</span>
            <Box component="kbd" sx={{ font: '11.5px ui-monospace,Menlo,monospace', bgcolor: 'grey.100', border: 1, borderBottomWidth: 2, borderColor: 'divider', borderRadius: 0.75, px: 0.75, color: 'text.primary' }}>{v}</Box>
          </Stack>
        ))}
      </Popover>
    </Box>
  );
}
