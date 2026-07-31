import { Node, Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorState, Selection, Transaction } from '@tiptap/pm/state';
// TableMap is a pure computation over the node structure — dual-instance safe.
import { TableMap } from '@tiptap/pm/tables';

import { getEditorLabels, getEditorMetrics } from '../configStore';
import { imageGeometryAttributes, type ImageAlign } from './imageExtended';

/** Image width upper bound (%). The lower bounds are runtime metrics (getEditorMetrics). */
const IMAGE_MAX_WIDTH_PCT = 100;

/** Contextual width: % (top-level image, responsive) or px (in-cell image). */
export type ImageWidth = { value: number; unit: '%' | 'px' };

/**
 * Clamp into the valid range for the unit; non-finite → null (natural width).
 * Every write path goes through here, reading runtime metrics so the minimums
 * stay configurable.
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

/**
 * Captioned image: <figure style="width:X"><img alt="{caption}"><figcaption>{caption}</figcaption></figure>.
 * An image WITHOUT a caption stays a bare <img> (backward compatible with existing notes).
 * appendTransaction unwraps a figure once its caption is empty and the selection
 * has left it, and mirrors caption → img alt (a11y + markdown ![caption](src)).
 */

export const Figcaption = Node.create({
  name: 'figcaption',
  content: 'inline*',
  selectable: false,

  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        const { empty, $anchor } = this.editor.state.selection;
        // A caption is a contained input: Backspace edits its text and reaches
        // nothing outside it. Swallow the key at offset 0, where ProseMirror would
        // otherwise joinBackward into the image the figure requires. Every other
        // position returns false, so normal character deletion is untouched.
        return empty && $anchor.parent.type.name === this.name && $anchor.parentOffset === 0;
      },
    };
  },

  parseHTML() {
    return [{ tag: 'figcaption' }];
  },

  renderHTML() {
    // data-placeholder: shown via CSS ::before while the caption is empty
    return ['figcaption', { 'data-placeholder': getEditorLabels().imageCaptionPlaceholder }, 0];
  },
});

export const Figure = Node.create({
  name: 'figure',
  group: 'block',
  content: 'image figcaption',
  isolating: true,

  addAttributes() {
    return imageGeometryAttributes('width');
  },

  parseHTML() {
    return [{ tag: 'figure' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['figure', HTMLAttributes, 0];
  },

  addProseMirrorPlugins() {
    return [figureMaintenancePlugin()];
  },
});

type MaintenanceJob =
  | { kind: 'unwrap'; pos: number; nodeSize: number }
  | { kind: 'dropOrphan'; pos: number; nodeSize: number }
  | { kind: 'syncAlt'; imagePos: number; alt: string };

const figureMaintenancePlugin = () =>
  new Plugin({
    key: new PluginKey('figureMaintenance'),
    appendTransaction(transactions, oldState, newState): Transaction | null {
      const docChanged = transactions.some(t => t.docChanged);
      const selectionChanged = !oldState.selection.eq(newState.selection);
      if (!docChanged && !selectionChanged) return null;

      const { doc, selection, schema } = newState;
      const jobs: MaintenanceJob[] = [];

      doc.descendants((node, pos) => {
        if (node.type.name !== 'figure') return true;
        const image = node.childCount > 0 ? node.child(0) : null;
        const caption = node.childCount > 1 ? node.child(1) : null;
        if (!image || image.type.name !== 'image') {
          // A figure without its image cannot satisfy `image figcaption`. Drop the
          // shell rather than leave a caption box the user can neither fill nor remove.
          jobs.push({ kind: 'dropOrphan', pos, nodeSize: node.nodeSize });
          return false;
        }

        const captionText = caption ? caption.textContent : '';
        const selectionInside = selection.from >= pos && selection.to <= pos + node.nodeSize;

        if (captionText.trim() === '' && !selectionInside) {
          jobs.push({ kind: 'unwrap', pos, nodeSize: node.nodeSize });
        } else if ((image.attrs.alt || '') !== captionText) {
          jobs.push({ kind: 'syncAlt', imagePos: pos + 1, alt: captionText });
        }
        return false;
      });

      if (jobs.length === 0) return null;

      const tr = newState.tr;
      // Reverse order: edits from the doc end don't shift the earlier positions
      for (const job of jobs.reverse()) {
        if (job.kind === 'unwrap') {
          const figure = tr.doc.nodeAt(job.pos);
          if (!figure || figure.type.name !== 'figure') continue;
          const image = figure.child(0);
          const bareImage = schema.nodes.image.create({
            ...image.attrs,
            pctWidth: figure.attrs.width ?? image.attrs.pctWidth,
            pxWidth: figure.attrs.pxWidth ?? image.attrs.pxWidth,
            align: figure.attrs.align ?? image.attrs.align,
            alt: null,
          });
          tr.replaceWith(job.pos, job.pos + figure.nodeSize, bareImage);
        } else if (job.kind === 'dropOrphan') {
          tr.delete(job.pos, job.pos + job.nodeSize);
        } else {
          const image = tr.doc.nodeAt(job.imagePos);
          if (!image || image.type.name !== 'image') continue;
          tr.setNodeMarkup(job.imagePos, null, { ...image.attrs, alt: job.alt || null });
        }
      }
      return tr.steps.length > 0 ? tr : null;
    },
  });

// ===== Actions BY NODE POSITION (never relying on the ambient selection) =====

/**
 * Caption ON: wrap the bare <img> in figure + figcaption, cursor at the caption
 * end, keyboard open. Caption text stashed in alt by the last toggle-OFF is
 * restored, so repeated toggling never loses text.
 */
export function wrapImageWithCaption(editor: Editor, imagePos: number): void {
  const { state, view } = editor;
  const node = state.doc.nodeAt(imagePos);
  if (!node || node.type.name !== 'image') return;

  const { schema } = state;
  const savedCaption = (node.attrs.alt as string | null) || '';
  const figcaption = savedCaption
    ? schema.nodes.figcaption.create(null, schema.text(savedCaption))
    : schema.nodes.figcaption.create();
  const figure = schema.nodes.figure.create(
    { width: node.attrs.pctWidth, pxWidth: node.attrs.pxWidth, align: node.attrs.align },
    [
      schema.nodes.image.create({ ...node.attrs, pctWidth: null, pxWidth: null, align: null }),
      figcaption,
    ],
  );

  let tr = state.tr.replaceWith(imagePos, imagePos + node.nodeSize, figure);
  // +3 = figure open + image node + figcaption open
  const captionEnd = imagePos + 3 + figcaption.content.size;
  const captionSelection = createTextSelectionAt(state, tr.doc, captionEnd);
  if (captionSelection) tr = tr.setSelection(captionSelection);
  view.dispatch(tr);
  view.focus();
}

/**
 * Caption OFF: unwrap figure → bare <img>, keeping the caption text in alt so the
 * next toggle-ON restores it intact. The image is re-selected but NOT focused —
 * the keyboard stays closed.
 */
export function unwrapFigurePreservingCaption(editor: Editor, figurePos: number): void {
  const { state, view } = editor;
  const figure = state.doc.nodeAt(figurePos);
  if (!figure || figure.type.name !== 'figure') return;
  const image = figure.child(0);
  if (!image || image.type.name !== 'image') return;
  const caption = figure.childCount > 1 ? figure.child(1) : null;
  const captionText = (caption ? caption.textContent : '').trim();

  const bareImage = state.schema.nodes.image.create({
    ...image.attrs,
    pctWidth: figure.attrs.width ?? image.attrs.pctWidth,
    pxWidth: figure.attrs.pxWidth ?? image.attrs.pxWidth,
    align: figure.attrs.align ?? image.attrs.align,
    alt: captionText || null,
  });

  let tr = state.tr.replaceWith(figurePos, figurePos + figure.nodeSize, bareImage);
  const nodeSelection = createNodeSelectionAt(state, tr.doc, figurePos);
  if (nodeSelection) tr = tr.setSelection(nodeSelection);
  view.dispatch(tr);
}

/**
 * Build selections with the class of the ProseMirror instance ACTUALLY RUNNING.
 *
 * NEVER build them from TextSelection/NodeSelection imported from @tiptap/pm: the
 * tentap bundle inlines its own prosemirror, and a foreign selection class is
 * INHERITED by every later transaction (mapping preserves it) and fails the
 * `instanceof` checks in prosemirror-view — typically the Backspace path in
 * capturekeys, where text cannot be deleted until the user taps for a fresh
 * selection. Walk the prototype chain to the base Selection class instead.
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
function createNodeSelectionAt(
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

/**
 * Write colwidth for every cell of the COLUMN containing pos into tr, using
 * prosemirror-tables' own colspan/rowspan formula. Backs "drag the image wider
 * than its cell → the column stretches with it" (Google Docs style).
 */
function applyColumnWidth(
  state: EditorState,
  tr: Transaction,
  pos: number,
  columnWidthPx: number,
): Transaction {
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
  const cellNode = $pos.node(cellDepth);
  const cellRel = $pos.before(cellDepth) - tableStart;
  const map = TableMap.get(table);
  const col = map.colCount(cellRel) + (cellNode.attrs.colspan ?? 1) - 1;

  for (let row = 0; row < map.height; row++) {
    const mapIndex = row * map.width + col;
    // Cell rowspans from a row above — already written
    if (row && map.map[mapIndex] === map.map[mapIndex - map.width]) continue;
    const rel = map.map[mapIndex];
    const cn = table.nodeAt(rel);
    if (!cn) continue;
    const colspan = cn.attrs.colspan ?? 1;
    const index = colspan === 1 ? 0 : col - map.colCount(rel);
    const colwidth: number[] = cn.attrs.colwidth
      ? [...cn.attrs.colwidth]
      : new Array(colspan).fill(0);
    if (colwidth[index] === columnWidthPx) continue;
    colwidth[index] = columnWidthPx;
    tr = tr.setNodeMarkup(tableStart + rel, null, { ...cn.attrs, colwidth });
  }
  return tr;
}

/**
 * Update width/align on the node at pos (figure or bare image).
 * options.history=false makes it a preview transaction, kept out of undo.
 *
 * ALWAYS re-select the image afterwards: setNodeMarkup loses the NodeSelection in
 * mapping (border + toolbar vanish, and a figure with an empty caption gets
 * unwrapped by the maintenance plugin as "the selection left the figure"), and a
 * resize drag may already have had its selection stolen by a WebKit ghost click.
 */
export function updateImageAttrs(
  editor: Editor,
  pos: number,
  patch: { width?: ImageWidth | null; align?: ImageAlign | null },
  options: { history?: boolean; columnWidthPx?: number } = {},
): void {
  const { state, view } = editor;
  const node = state.doc.nodeAt(pos);
  if (!node) return;

  // Unit → attr, only ONE semantic kept: % → figure 'width' / image 'pctWidth';
  // px → 'pxWidth' on both. On images, also strip legacy width/height attrs.
  const isFigureNode = node.type.name === 'figure';
  const attrPatch: Record<string, unknown> = { ...node.attrs };
  if ('width' in patch) {
    const width = clampImageWidth(patch.width);
    const pctValue = width && width.unit === '%' ? width.value : null;
    const pxValue = width && width.unit === 'px' ? width.value : null;
    attrPatch[isFigureNode ? 'width' : 'pctWidth'] = pctValue;
    attrPatch.pxWidth = pxValue;
    if (!isFigureNode) {
      attrPatch.width = null;
      attrPatch.height = null;
    }
  }
  if ('align' in patch) attrPatch.align = patch.align;
  let tr = state.tr.setNodeMarkup(pos, null, attrPatch);

  // Same transaction as the attr change so undo is a single step
  if (options.columnWidthPx !== undefined && Number.isFinite(options.columnWidthPx)) {
    tr = applyColumnWidth(state, tr, pos, Math.round(options.columnWidthPx));
  }

  const imagePos = node.type.name === 'figure' ? pos + 1 : pos;
  const nodeSelection = createNodeSelectionAt(state, tr.doc, imagePos);
  if (nodeSelection) tr = tr.setSelection(nodeSelection);

  if (options.history === false) tr = tr.setMeta('addToHistory', false);
  view.dispatch(tr);
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
  view.dispatch(tr);
  view.focus();
}

/** Empty paragraph BEFORE the node at pos, cursor there, keyboard open. */
export function insertParagraphAbove(editor: Editor, pos: number): void {
  const { state, view } = editor;
  const paragraph = state.schema.nodes.paragraph.create();
  let tr = state.tr.insert(pos, paragraph);
  const cursorSelection = createTextSelectionAt(state, tr.doc, pos + 1);
  if (cursorSelection) tr = tr.setSelection(cursorSelection);
  view.dispatch(tr);
  view.focus();
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
  view.dispatch(tr);
  view.focus();
}
