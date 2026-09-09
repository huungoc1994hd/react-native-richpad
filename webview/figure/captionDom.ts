/**
 * The caption field's DOM invariants. No editor, no ProseMirror — only the shape
 * WebKit needs to paint a caret in an editable island.
 */

/**
 * Empty field invariant: [empty text node, <br>]. The <br> holds the line box, the
 * text node holds a caret anchor WebKit will paint. With text, neither is kept.
 */
export const ensureCaretLine = (dom: HTMLElement): void => {
  if ((dom.textContent ?? '') !== '') {
    // WebKit can leave its own filler BR behind, making the caption two lines tall.
    dom.querySelectorAll('br').forEach(br => br.remove());
    return;
  }
  if (!(dom.firstChild instanceof Text)) {
    dom.insertBefore(document.createTextNode(''), dom.firstChild);
  }
  if (!dom.querySelector('br')) {
    dom.appendChild(document.createElement('br'));
  }
};

/** Field text, with the nbsp contenteditable inserts at line ends folded back. */
export const readValue = (dom: HTMLElement): string =>
  (dom.textContent ?? '').replace(/\u00a0/g, ' ');
