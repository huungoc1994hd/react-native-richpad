import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { createTextSelectionAt } from './figure';

/**
 * Tap a LINK → cursor INSIDE it. A plain tap drops the caret at the END of the
 * link, outside the mark (inclusive=false), so the link button cannot recognize
 * it to prefill edit/delete. The hit target is the whole <a>, far easier to hit
 * than a precise character.
 */
export const LinkTapHandler = Extension.create({
  name: 'linkTapHandler',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('linkTapHandler'),
        props: {
          handleClick(view, _pos, event) {
            const target = event.target as HTMLElement | null;
            const anchor = target?.closest?.('a');
            if (!anchor || !view.dom.contains(anchor)) return false;

            // +1: past the outer boundary, which carries no mark
            try {
              const insidePos = view.posAtDOM(anchor, 0) + 1;
              const state = view.state;
              const selection = createTextSelectionAt(
                state as never,
                state.doc as never,
                insidePos,
              );
              if (selection) {
                view.dispatch(state.tr.setSelection(selection));
                return true;
              }
            } catch {
              // could not place the cursor — fall back to the default behavior
            }
            return false;
          },
        },
      }),
    ];
  },
});
