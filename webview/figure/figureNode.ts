import { Node } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { ViewMutationRecord } from '@tiptap/pm/view';
import { alignStyle, imageGeometryAttributes, type ImageAlign } from '../extensions/imageExtended';
import { findTextSelectionNear } from '../extensions/pmSelection';
import { figureMaintenancePlugin } from './maintenance';

/** Inline style for a figure from its attrs; matches renderHTML so it round-trips. */
const figureStyle = (attrs: Record<string, unknown>): string => {
  const styles: string[] = [];
  if (attrs.width) styles.push(`width:${attrs.width}%;`);
  if (attrs.pxWidth) styles.push(`width:${attrs.pxWidth}px;`);
  const align = alignStyle(attrs.align as ImageAlign | null);
  if (align) styles.push(align);
  return styles.join('');
};

/**
 * Image block: <figure><img alt="{caption}"><figcaption></figure>. EVERY image lives
 * in a figure; the figcaption child comes and goes, leaving nothing behind.
 */
export const Figure = Node.create({
  name: 'figure',
  group: 'block',
  // figcaption? — toggling the caption never rebuilds the figure or its <img>.
  content: 'image figcaption?',
  isolating: true,

  addAttributes() {
    return imageGeometryAttributes('width');
  },

  /**
   * Deleting a selected image deletes the WHOLE figure: the stock command removes
   * the image alone, leaving PM to satisfy the schema with a broken default one.
   */
  addKeyboardShortcuts() {
    const deleteSelectedFigure = () => {
      const { state, view } = this.editor;
      const selected = (state.selection as { node?: PMNode }).node;
      if (!selected || selected.type.name !== 'image') return false;
      const $pos = state.doc.resolve(state.selection.from);
      if ($pos.parent.type.name !== 'figure') return false;

      const figurePos = $pos.before($pos.depth);
      const figure = state.doc.nodeAt(figurePos);
      if (!figure) return false;
      let tr = state.tr.delete(figurePos, figurePos + figure.nodeSize);
      const near = findTextSelectionNear(
        state,
        tr.doc.resolve(Math.min(figurePos, tr.doc.content.size)),
      );
      if (near) tr = tr.setSelection(near);
      view.dispatch(tr);
      return true;
    };
    return { Backspace: deleteSelectedFigure, Delete: deleteSelectedFigure };
  },

  parseHTML() {
    return [{ tag: 'figure' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['figure', HTMLAttributes, 0];
  },

  /**
   * The shell is contenteditable=false, so the <img> sits outside any editing host.
   * A NodeView rather than renderHTML keeps that attribute out of getHTML's output.
   */
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('figure');
      dom.contentEditable = 'false';
      const style = figureStyle(node.attrs);
      if (style) dom.setAttribute('style', style);
      return {
        dom,
        contentDOM: dom,
        update(updated: PMNode) {
          if (updated.type.name !== 'figure') return false;
          const nextStyle = figureStyle(updated.attrs);
          if (nextStyle) dom.setAttribute('style', nextStyle);
          else dom.removeAttribute('style');
          // contentEditable has to survive every update.
          dom.contentEditable = 'false';
          return true;
        },
        /**
         * Attribute writes on THIS element are ours; a redraw would kill the caption
         * (quirk 6). Children still reach PM — it doubles as the contentDOM.
         */
        ignoreMutation: (mutation: ViewMutationRecord) =>
          mutation.type === 'attributes' && mutation.target === dom,
      };
    };
  },

  addProseMirrorPlugins() {
    return [figureMaintenancePlugin()];
  },
});
