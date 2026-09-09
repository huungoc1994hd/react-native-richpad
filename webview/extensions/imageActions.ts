import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { EditorState, Transaction } from '@tiptap/pm/state';
// TableMap is a pure computation over the node structure — dual-instance safe.
import { TableMap } from '@tiptap/pm/tables';

import { getEditorMetrics } from '../configStore';
import {
  announceCaptionFocus,
  focusCaptionField,
  getCaptionOwner,
  releaseDomFocus,
} from './captionSession';
import type { ImageAlign } from './imageExtended';
import { createNodeSelectionAt, createTextSelectionAt, findTextSelectionNear } from './pmSelection';

/** Image width upper bound (%). The lower bounds are runtime metrics (getEditorMetrics). */
const IMAGE_MAX_WIDTH_PCT = 100;

/** Contextual width: % (top-level image, responsive) or px (in-cell image). */
export type ImageWidth = { value: number; unit: '%' | 'px' };

/**
 * Clamp into the valid range for the unit; non-finite → null (natural width).
 * Every write path goes through here, reading the runtime metrics.
 */
const clampImageWidth = (width: ImageWidth | null | undefined): ImageWidth | null | undefined => {
  if (width === null || width === undefined) return width;
  if (!Number.isFinite(width.value)) return null;
  const { imageMinWidthPct, imageMinWidthPx } = getEditorMetrics();
  const value =
    width.unit === 'px'
      ? Math.max(imageMinWidthPx, Math.round(width.value))
      : Math.min(IMAGE_MAX_WIDTH_PCT, Math.max(imageMinWidthPct, Math.round(width.value)));
  return { value, unit: width.unit };
};

// Every action below works from a node POSITION, never the ambient selection.

/**
 * Caption text of HIDDEN captions, per live figure element. Never in the document:
 * alt IS the caption to every consumer, so a stash there resurrects it on load.
 */
const hiddenCaptionText = new WeakMap<Element, string>();

/**
 * Caption ON: insert a figcaption and focus it, leaving the <img> untouched. Text
 * comes from an earlier toggle-off this session, else from the img alt.
 */
export function showCaption(editor: Editor, imagePos: number): void {
  const { state, view } = editor;
  const node = state.doc.nodeAt(imagePos);
  if (!node || node.type.name !== 'image') return;
  const $pos = state.doc.resolve(imagePos);
  if ($pos.parent.type.name !== 'figure') return;
  if ($pos.parent.childCount > 1) return;
  const figurePos = $pos.before($pos.depth);

  const { schema } = state;
  const figureDomForRestore = view.nodeDOM(figurePos);
  const savedCaption =
    (figureDomForRestore instanceof Element
      ? hiddenCaptionText.get(figureDomForRestore)
      : undefined) ??
    ((node.attrs.alt as string | null) || '');
  const figcaption = savedCaption
    ? schema.nodes.figcaption.create(null, schema.text(savedCaption))
    : schema.nodes.figcaption.create();

  let tr = state.tr.insert(figurePos + 1 + node.nodeSize, figcaption);
  // The PM selection stays on the image node, so the outline and toolbar do not
  // change; caption typing happens outside PM's selection model.
  const imageSelection = createNodeSelectionAt(state, tr.doc, imagePos);
  if (imageSelection) tr = tr.setSelection(imageSelection);
  view.dispatch(tr);

  // Focus the caption field; the helper announces first so ownership is settled
  // before keyboardWillShow.
  const figureDom = view.nodeDOM(figurePos);
  focusCaptionField(figureDom instanceof HTMLElement ? figureDom : null);
}

/**
 * Caption OFF: delete the figcaption and clear the img alt; the text moves to
 * session memory so toggling back on restores it. The <img> never re-renders.
 */
export function hideCaption(editor: Editor, figurePos: number): void {
  // The focused field is about to be REMOVED, which would end the input session.
  // Hand it over first, announcing before the blur so RN sees no intermediate state.
  if (getCaptionOwner()) {
    announceCaptionFocus(null);
    releaseDomFocus();
    editor.view.focus();
  }

  // The blur above may have dispatched (alt sync; an empty caption removes
  // itself) — read the state FRESH, never from before the blur.
  const { state, view } = editor;
  const figure = state.doc.nodeAt(figurePos);
  if (!figure || figure.type.name !== 'figure' || figure.childCount < 2) return;
  const image = figure.child(0);
  const caption = figure.child(1);
  const captionText = caption.textContent.trim();

  const figureDom = view.nodeDOM(figurePos);
  if (figureDom instanceof Element && captionText) {
    hiddenCaptionText.set(figureDom, captionText);
  }

  const captionPos = figurePos + 1 + image.nodeSize;
  let tr = state.tr.delete(captionPos, captionPos + caption.nodeSize);
  if (image.attrs.alt) {
    tr = tr.setNodeMarkup(figurePos + 1, null, { ...image.attrs, alt: null });
  }
  const nodeSelection = createNodeSelectionAt(state, tr.doc, figurePos + 1);
  if (nodeSelection) tr = tr.setSelection(nodeSelection);
  view.dispatch(tr);
}
/**
 * Widen the COLUMN holding the node at pos. prosemirror-tables keeps widths as
 * per-cell colwidth arrays, and a colspan cell carries it on its LAST column.
 */
const applyColumnWidth = (
  state: EditorState,
  tr: Transaction,
  pos: number,
  widthPx: number,
): Transaction => {
  const $pos = state.doc.resolve(pos);
  let cellDepth = -1;
  let tableDepth = -1;
  for (let depth = $pos.depth; depth > 0; depth--) {
    const name = $pos.node(depth).type.name;
    if (cellDepth < 0 && (name === 'tableCell' || name === 'tableHeader')) cellDepth = depth;
    if (name === 'table') {
      tableDepth = depth;
      break;
    }
  }
  if (cellDepth < 0 || tableDepth < 0) return tr;
  const table = $pos.node(tableDepth);
  const tableStart = $pos.start(tableDepth);
  const cell = $pos.node(cellDepth);
  const cellPos = $pos.before(cellDepth) - tableStart;
  const map = TableMap.get(table);
  const col = map.colCount(cellPos) + (cell.attrs.colspan ?? 1) - 1;
  for (let row = 0; row < map.height; row++) {
    const index = row * map.width + col;
    // A rowspan cell appears in several rows — update it once.
    if (row && map.map[index] === map.map[index - map.width]) continue;
    const mapped = map.map[index];
    const target = table.nodeAt(mapped);
    if (!target) continue;
    const colspan = target.attrs.colspan ?? 1;
    const entry = colspan === 1 ? 0 : col - map.colCount(mapped);
    const colwidth = target.attrs.colwidth
      ? [...target.attrs.colwidth]
      : new Array<number>(colspan).fill(0);
    if (colwidth[entry] !== widthPx) {
      colwidth[entry] = widthPx;
      tr = tr.setNodeMarkup(tableStart + mapped, null, { ...target.attrs, colwidth });
    }
  }
  return tr;
};

export function updateImageAttrs(
  editor: Editor,
  pos: number,
  patch: { width?: ImageWidth | null; align?: ImageAlign | null },
  options: { history?: boolean; columnWidthPx?: number } = {},
): void {
  const { state, view } = editor;
  const node = state.doc.nodeAt(pos);
  if (!node) return;

  // Geometry lives on the FIGURE (every image is one — see imageNormalizer):
  // % → 'width', px → 'pxWidth', only ONE semantic kept.
  if (node.type.name !== 'figure') return;
  const attrPatch: Record<string, unknown> = { ...node.attrs };
  if ('width' in patch) {
    const width = clampImageWidth(patch.width);
    attrPatch.width = width && width.unit === '%' ? width.value : null;
    attrPatch.pxWidth = width && width.unit === 'px' ? width.value : null;
  }
  if ('align' in patch) attrPatch.align = patch.align;
  let tr = state.tr.setNodeMarkup(pos, null, attrPatch);

  // Same transaction as the attr change so undo is a single step
  if (options.columnWidthPx !== undefined && Number.isFinite(options.columnWidthPx)) {
    tr = applyColumnWidth(state, tr, pos, Math.round(options.columnWidthPx));
  }

  const nodeSelection = createNodeSelectionAt(state, tr.doc, pos + 1);
  if (nodeSelection) tr = tr.setSelection(nodeSelection);

  if (options.history === false) tr = tr.setMeta('addToHistory', false);
  view.dispatch(tr);
}

/**
 * Marks a transaction that DELIBERATELY leaves image mode, so the "caption typing
 * keeps the image active" rule in ImageHandles stands down instead of undoing it.
 */
export const LEAVE_IMAGE_META = 'richpadLeaveImage';

/** Focus the editor after an action that leaves image mode, keyboard open to keep typing. */
function focusEditorForTyping(editor: Editor): void {
  editor.view.focus();
}

/** Delete the figure/image at pos, cursor nearby, keyboard open to keep typing. */
export function deleteImageNode(editor: Editor, pos: number): void {
  const { state, view } = editor;
  const node = state.doc.nodeAt(pos);
  if (!node) return;
  let tr = state.tr.delete(pos, pos + node.nodeSize);
  const safePos = Math.min(pos, tr.doc.content.size);
  const nearSelection = findTextSelectionNear(state, tr.doc.resolve(safePos));
  if (nearSelection) tr = tr.setSelection(nearSelection);
  tr = tr.setMeta(LEAVE_IMAGE_META, true);
  view.dispatch(tr);
  focusEditorForTyping(editor);
}

/**
 * End the WHOLE image session on command from RN. The ORDER is what makes the relay
 * emit exactly one final report: deselect, announce null, blur, then one dispatch.
 */
export function leaveImageSession(editor: Editor, options: { focusEditor?: boolean } = {}): void {
  const { state, view } = editor;
  const selectedNode = (state.selection as { node?: PMNode }).node;
  if (selectedNode?.type.name === 'image') {
    let tr = state.tr;
    const near = findTextSelectionNear(state, tr.doc.resolve(state.selection.to));
    if (near) tr = tr.setSelection(near);
    tr = tr.setMeta(LEAVE_IMAGE_META, true);
    view.dispatch(tr);
  }
  const field = getCaptionOwner();
  if (field) {
    announceCaptionFocus(null);
    field.blur();
    editor.view.dispatch(editor.state.tr);
  }
  if (options.focusEditor) {
    focusEditorForTyping(editor);
  }
}

/** Empty paragraph BEFORE the node at pos, cursor there, keyboard open. */
export function insertParagraphAbove(editor: Editor, pos: number): void {
  const { state, view } = editor;
  const paragraph = state.schema.nodes.paragraph.create();
  let tr = state.tr.insert(pos, paragraph);
  const cursorSelection = createTextSelectionAt(state, tr.doc, pos + 1);
  if (cursorSelection) tr = tr.setSelection(cursorSelection);
  tr = tr.setMeta(LEAVE_IMAGE_META, true);
  // The new line lands at the top of the document, where WebKit's own scroll can
  // leave it half under the host's toolbar until the first keystroke.
  tr = tr.scrollIntoView();
  view.dispatch(tr);
  focusEditorForTyping(editor);
}

/** Empty paragraph AFTER the node at pos, cursor there, keyboard open. */
export function insertParagraphBelow(editor: Editor, pos: number): void {
  const { state, view } = editor;
  const node = state.doc.nodeAt(pos);
  if (!node) return;
  const after = pos + node.nodeSize;
  const paragraph = state.schema.nodes.paragraph.create();
  let tr = state.tr.insert(after, paragraph);
  const cursorSelection = createTextSelectionAt(state, tr.doc, after + 1);
  if (cursorSelection) tr = tr.setSelection(cursorSelection);
  tr = tr.setMeta(LEAVE_IMAGE_META, true);
  tr = tr.scrollIntoView();
  view.dispatch(tr);
  focusEditorForTyping(editor);
}
