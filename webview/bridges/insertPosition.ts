import type { Editor } from '@tiptap/core';

/**
 * Cursor position frozen at ForceBlur time: the blur + picker sequence can reset the
 * live selection, so image/table inserts use this instead.
 */
let savedInsertPos: number | null = null;

/** Freeze the cursor BEFORE blurring — blur/removeAllRanges resets PM's selection. */
export const setSavedInsertPos = (pos: number): void => {
  savedInsertPos = pos;
};

const clampPos = (editor: Editor, pos: number) =>
  Math.max(0, Math.min(pos, editor.state.doc.content.size));

/**
 * Move a position INSIDE a figure to AFTER the whole block: inserting into one
 * violates the schema and ProseMirror tears the figure apart.
 */
const sanitizeInsertPos = (editor: Editor, pos: number): number => {
  const $pos = editor.state.doc.resolve(clampPos(editor, pos));
  for (let depth = $pos.depth; depth > 0; depth--) {
    if ($pos.node(depth).type.name === 'figure') {
      return $pos.after(depth);
    }
  }
  return $pos.pos;
};

/** Resolve the insert position: saved position first, current selection as fallback — sanitized. */
export const takeInsertPos = (editor: Editor): number => {
  const pos = savedInsertPos !== null ? savedInsertPos : editor.state.selection.to;
  savedInsertPos = null;
  return sanitizeInsertPos(editor, pos);
};
