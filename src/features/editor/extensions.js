// 編輯器擴充集中管理：任何頁面都可透過 createExtensions() 取得一致的設定，
// 並以 options 開關或追加自訂擴充，不綁死在會議頁面。
import { Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Image from '@tiptap/extension-image';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import { MeetingTidy } from './tidy/TidyExtension';

// 自訂：字體大小（掛在 textStyle mark 上）
export const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() { return { types: ['textStyle'] }; },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (el) => el.style.fontSize || null,
          renderHTML: (a) => (a.fontSize ? { style: `font-size: ${a.fontSize}` } : {}),
        },
      },
    }];
  },
  addCommands() {
    return {
      setFontSize: (size) => ({ chain }) => chain().setMark('textStyle', { fontSize: size }).run(),
      unsetFontSize: () => ({ chain }) => chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});

// 自訂：Mod-S 立即儲存（由外部注入 onSave）
export const SaveShortcut = Extension.create({
  name: 'saveShortcut',
  addOptions() { return { onSave: () => {} }; },
  addKeyboardShortcuts() {
    return { 'Mod-s': () => { this.options.onSave(); return true; } };
  },
});

export function createExtensions({ placeholder = '在此輸入內容…', onSave, extra = [] } = {}) {
  return [
    StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
    Underline,
    TextStyle,
    Color,
    FontSize,
    TaskList,
    TaskItem.configure({ nested: true }),
    Image.configure({ allowBase64: true, HTMLAttributes: { class: 'ed-img' } }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' } }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Placeholder.configure({ placeholder }),
    SaveShortcut.configure({ onSave: onSave || (() => {}) }),
    MeetingTidy,
    ...extra,
  ];
}
