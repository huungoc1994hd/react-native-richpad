import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Transaction } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import { getCaptionOwner } from '../extensions/captionSession';
import { createNodeSelectionAt } from '../extensions/pmSelection';

type MaintenanceJob =
  | { kind: 'removeCaption'; pos: number }
  | { kind: 'dropOrphan'; pos: number; nodeSize: number }
  | { kind: 'syncAlt'; imagePos: number; alt: string };

/**
 * Keeps every figure in a valid resting state: no shell without a usable image, no
 * empty caption the selection has left, and img alt mirroring a visible caption.
 */
export const figureMaintenancePlugin = () =>
  new Plugin({
    key: new PluginKey('figureMaintenance'),
    appendTransaction(transactions, oldState, newState): Transaction | null {
      const docChanged = transactions.some(t => t.docChanged);
      const selectionChanged = !oldState.selection.eq(newState.selection);
      if (!docChanged && !selectionChanged) return null;

      const { doc, selection } = newState;
      const jobs: MaintenanceJob[] = [];

      doc.descendants((node, pos) => {
        if (node.type.name !== 'figure') return true;
        const image = node.childCount > 0 ? node.child(0) : null;
        const caption = node.childCount > 1 ? node.child(1) : null;
        // "Usable" means HAS A SRC: the schema makes the image required, so deleting
        // it leaves PM a default one — a 0px broken node.
        const imageSrc = image?.attrs?.src;
        if (!image || image.type.name !== 'image' || !imageSrc) {
          jobs.push({ kind: 'dropOrphan', pos, nodeSize: node.nodeSize });
          return false;
        }

        // A captionless figure is valid; its alt is left alone because pasted
        // `<img alt>` carries the caption there and showCaption seeds the field from it.
        if (!caption) return false;

        const captionText = caption.textContent;
        const selectionInside = selection.from >= pos && selection.to <= pos + node.nodeSize;
        // A focused field means the user is typing while the PM selection may sit
        // outside the figure: its blur handles both jobs instead.
        if (getCaptionOwner()) return false;
        if (captionText.trim() === '' && !selectionInside) {
          jobs.push({ kind: 'removeCaption', pos });
        } else if ((image.attrs.alt || '') !== captionText) {
          jobs.push({ kind: 'syncAlt', imagePos: pos + 1, alt: captionText });
        }
        return false;
      });

      if (jobs.length === 0) return null;

      const tr = newState.tr;
      // Reverse order: edits from the doc end do not shift the earlier positions.
      for (const job of jobs.reverse()) {
        if (job.kind === 'removeCaption') {
          const figure = tr.doc.nodeAt(job.pos);
          if (!figure || figure.type.name !== 'figure' || figure.childCount < 2) continue;
          const image = figure.child(0);
          const caption = figure.child(1);
          const captionPos = job.pos + 1 + image.nodeSize;
          tr.delete(captionPos, captionPos + caption.nodeSize);
          // An empty caption stashes nothing.
          if (image.attrs.alt) tr.setNodeMarkup(job.pos + 1, null, { ...image.attrs, alt: null });
        } else if (job.kind === 'dropOrphan') {
          tr.delete(job.pos, job.pos + job.nodeSize);
        } else {
          const image = tr.doc.nodeAt(job.imagePos);
          if (!image || image.type.name !== 'image') continue;
          // setNodeMarkup drops the NodeSelection during mapping: re-select in the SAME
          // transaction so observers only see the final state.
          const selectedNode = (selection as { node?: PMNode }).node;
          const imageWasSelected =
            !!selectedNode && selectedNode.type.name === 'image' && selection.from === job.imagePos;
          tr.setNodeMarkup(job.imagePos, null, { ...image.attrs, alt: job.alt || null });
          if (imageWasSelected) {
            const keepSelected = createNodeSelectionAt(newState, tr.doc, job.imagePos);
            if (keepSelected) tr.setSelection(keepSelected);
          }
        }
      }
      return tr.steps.length > 0 ? tr : null;
    },
  });
