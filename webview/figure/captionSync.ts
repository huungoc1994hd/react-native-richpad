import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { createNodeSelectionAt, selectImageNodeAt } from '../extensions/pmSelection';
import { readValue } from './captionDom';

/** Everything the caption field writes back into the document. */
export type CaptionContext = {
  dom: HTMLElement;
  editor: Editor;
  /** tiptap hands the NodeView a getPos that can be absent. */
  resolvePos: () => number | undefined;
};

/** Position of the figure holding this caption, or undefined if it has moved. */
const figurePos = ({ editor, resolvePos }: CaptionContext): number | undefined => {
  const pos = resolvePos();
  if (typeof pos !== 'number') return undefined;
  const $pos = editor.state.doc.resolve(pos);
  return $pos.parent.type.name === 'figure' ? $pos.before() : undefined;
};

/** Write the field's text into the figcaption node; no-op when unchanged. */
export const syncToDoc = (ctx: CaptionContext): void => {
  const pos = ctx.resolvePos();
  if (typeof pos !== 'number') return;
  const { state, view } = ctx.editor;
  const current = state.doc.nodeAt(pos);
  if (!current || current.type.name !== 'figcaption') return;
  const value = readValue(ctx.dom);
  if (current.textContent === value) return;
  const start = pos + 1;
  const end = pos + 1 + current.content.size;
  const tr = value
    ? state.tr.replaceWith(start, end, state.schema.text(value))
    : state.tr.delete(start, end);
  view.dispatch(tr);
};

/**
 * Mirror the caption into the image's alt, on BLUR only: setNodeMarkup per keystroke
 * makes PM rewrite the DOM selection and WebKit then pulls focus out of the field.
 */
export const syncAltToImage = (ctx: CaptionContext): void => {
  const pos = ctx.resolvePos();
  const figure = figurePos(ctx);
  if (typeof pos !== 'number' || figure === undefined) return;
  const { state, view } = ctx.editor;
  const imagePos = figure + 1;
  const image = state.doc.nodeAt(imagePos);
  const caption = state.doc.nodeAt(pos);
  if (!image || image.type.name !== 'image' || !caption) return;
  const captionText = caption.textContent;
  if ((image.attrs.alt || '') === captionText) return;
  let tr = state.tr.setNodeMarkup(imagePos, null, { ...image.attrs, alt: captionText || null });
  const selectedNode = (state.selection as { node?: PMNode }).node;
  if (selectedNode?.type.name === 'image' && state.selection.from === imagePos) {
    const keepSelected = createNodeSelectionAt(state, tr.doc, imagePos);
    if (keepSelected) tr = tr.setSelection(keepSelected);
  }
  view.dispatch(tr);
};

/**
 * Spec: while a caption has focus its image stays active. Returns true when a
 * selection dispatch was needed, i.e. the document is about to change.
 */
export const ensureImageSelected = (ctx: CaptionContext): boolean => {
  const figure = figurePos(ctx);
  if (figure === undefined) return false;
  const imagePos = figure + 1;
  const { state } = ctx.editor;
  const selectedNode = (state.selection as { node?: PMNode }).node;
  if (selectedNode?.type.name === 'image' && state.selection.from === imagePos) return false;
  selectImageNodeAt(ctx.editor, imagePos);
  return true;
};

/**
 * Drop an empty figcaption. Only the caption child goes, so the <img> never
 * re-renders; an empty caption stashes nothing, so its alt goes with it.
 */
export const removeEmptyCaption = (editor: Editor, figurePosition: number): void => {
  const { state, view } = editor;
  const figure = state.doc.nodeAt(figurePosition);
  if (!figure || figure.type.name !== 'figure') return;
  const image = figure.childCount > 0 ? figure.child(0) : null;
  if (!image || image.type.name !== 'image') return;
  const caption = figure.childCount > 1 ? figure.child(1) : null;
  if (!caption || caption.textContent.trim() !== '') return;
  const captionPos = figurePosition + 1 + image.nodeSize;
  let tr = state.tr.delete(captionPos, captionPos + caption.nodeSize);
  if (image.attrs.alt) {
    tr = tr.setNodeMarkup(figurePosition + 1, null, { ...image.attrs, alt: null });
  }
  view.dispatch(tr);
};

/** Blur housekeeping: an empty field is removed, a filled one updates the alt. */
export const commitOnBlur = (ctx: CaptionContext): void => {
  syncToDoc(ctx);
  if (readValue(ctx.dom).trim() !== '') {
    syncAltToImage(ctx);
    return;
  }
  const figure = figurePos(ctx);
  if (figure !== undefined) removeEmptyCaption(ctx.editor, figure);
};
