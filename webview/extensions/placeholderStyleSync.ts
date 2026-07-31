import { Extension } from '@tiptap/core';

/**
 * Mirrors the font-size at the cursor (including a stored mark just picked in the
 * toolbar) into --editor-placeholder-font-size, so the placeholder renders at the
 * size that will actually be typed. Needed because the placeholder is a ::before
 * on an empty node: it inherits the node's size, but the textStyle font-size mark
 * applies to TEXT only, and an empty doc has no text for a stored mark to reach.
 */
export const PlaceholderStyleSync = Extension.create({
  name: 'placeholderStyleSync',

  onTransaction() {
    const fontSize = this.editor.getAttributes('textStyle').fontSize as string | undefined;
    document.documentElement.style.setProperty(
      '--editor-placeholder-font-size',
      fontSize ?? 'inherit',
    );
  },
});
