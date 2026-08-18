import type { Editor } from '@tiptap/core';
import type { EditorState, Selection } from '@tiptap/pm/state';

/**
 * Build selections with the class of the ProseMirror instance ACTUALLY RUNNING: a
 * foreign one fails prosemirror-view's instanceof checks and strands Backspace (quirk 9).
 */
const getSelectionBase = (state: EditorState) =>
  Object.getPrototypeOf(state.selection.constructor) as {
    fromJSON?: (doc: EditorState['doc'], json: SelectionJSON) => Selection;
    findFrom?: (
      $pos: ReturnType<EditorState['doc']['resolve']>,
      dir: number,
      textOnly?: boolean,
    ) => Selection | null | undefined;
  };

/** Serialized form Selection.fromJSON accepts; the `type` decides the class it builds. */
type SelectionJSON =
  { type: 'text'; anchor: number; head: number } | { type: 'node'; anchor: number };

/** NodeSelection at pos. */
export function createNodeSelectionAt(
  state: EditorState,
  doc: EditorState['doc'],
  pos: number,
): Selection | null {
  try {
    const base = getSelectionBase(state);
    if (typeof base.fromJSON !== 'function') return null;
    return base.fromJSON(doc, { type: 'node', anchor: pos });
  } catch {
    return null;
  }
}

/** TextSelection covering from..to — Selection class from the running instance. */
export function createTextRangeSelection(
  state: EditorState,
  doc: EditorState['doc'],
  from: number,
  to: number,
): Selection | null {
  try {
    const base = getSelectionBase(state);
    if (typeof base.fromJSON !== 'function') return null;
    return base.fromJSON(doc, { type: 'text', anchor: from, head: to });
  } catch {
    return null;
  }
}

/** Cursor TextSelection at pos — Selection class from the running instance. */
export function createTextSelectionAt(
  state: EditorState,
  doc: EditorState['doc'],
  pos: number,
): Selection | null {
  try {
    const base = getSelectionBase(state);
    if (typeof base.fromJSON !== 'function') return null;
    return base.fromJSON(doc, { type: 'text', anchor: pos, head: pos });
  } catch {
    return null;
  }
}

/** Equivalent of TextSelection.near — Selection class from the running instance. */
export function findTextSelectionNear(
  state: EditorState,
  $pos: ReturnType<EditorState['doc']['resolve']>,
  dir: 1 | -1 = 1,
): Selection | null {
  try {
    const base = getSelectionBase(state);
    if (typeof base.findFrom !== 'function') return null;
    return base.findFrom($pos, dir, true) ?? base.findFrom($pos, -dir, true) ?? null;
  } catch {
    return null;
  }
}

/** NodeSelection at pos, focus unchanged — Selection class from the running instance. */
export function selectImageNodeAt(editor: Editor, pos: number): void {
  const { state, view } = editor;
  const node = state.doc.nodeAt(pos);
  if (!node || node.type.name !== 'image') return;
  const nodeSelection = createNodeSelectionAt(state, state.doc, pos);
  if (nodeSelection) view.dispatch(state.tr.setSelection(nodeSelection));
}
