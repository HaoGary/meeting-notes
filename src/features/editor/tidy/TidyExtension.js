// Tiptap 擴充：editor.commands.tidyDocument(options)
// 以單一交易套用整理結果，可用 Ctrl/⌘ + Z 一次復原。
import { Extension } from '@tiptap/core';
import { tidyDoc, DEFAULT_TIDY } from './tidyDoc';

export const MeetingTidy = Extension.create({
  name: 'meetingTidy',
  addOptions() { return { defaults: DEFAULT_TIDY }; },
  addCommands() {
    return {
      tidyDocument: (opts) => ({ editor, commands }) => {
        const { doc, changed } = tidyDoc(editor.getJSON(), { ...this.options.defaults, ...opts });
        if (!changed) return false;
        return commands.setContent(doc, true); // emitUpdate → 觸發自動儲存
      },
    };
  },
});
