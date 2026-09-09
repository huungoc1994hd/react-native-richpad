import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorState } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
// Selections must come from the running PM instance — see figure/figureNode.ts.
import { findTextSelectionNear } from './pmSelection';

/** Containers whose boundary backspace cannot join backward across. */
const JOIN_BARRIER_PARENTS = new Set(['doc', 'tableCell', 'tableHeader']);

/** The keyCode a browser reports when the IME, not the page, owns the key press. */
const IME_KEYCODE = 229;
const BACKSPACE_KEYCODE = 8;

/**
 * Range of the caret's paragraph when it is EMPTY and FIRST inside a join-barrier
 * container with a sibling after it — the one state joinBackward cannot resolve.
 */
const trapParagraphRange = (state: EditorState): { from: number; to: number } | null => {
  const { selection } = state;
  if (!selection.empty) return null;
  const $anchor = selection.$anchor;

  const parent = $anchor.parent;
  if (parent.type.name !== 'paragraph' || parent.content.size > 0) return null;

  const containerDepth = $anchor.depth - 1;
  if (containerDepth < 0) return null;
  const container = $anchor.node(containerDepth);
  if (!JOIN_BARRIER_PARENTS.has(container.type.name)) return null;
  if ($anchor.index(containerDepth) !== 0 || container.childCount < 2) return null;

  return { from: $anchor.before(), to: $anchor.after() };
};

/** Removes the trapped empty paragraph; false when the caret is elsewhere. */
const deleteTrapParagraph = (editor: Editor): boolean => {
  const { state, view } = editor;
  const range = trapParagraphRange(state);
  if (!range) return false;

  const tr = state.tr.delete(range.from, range.to);
  const nextSelection = findTextSelectionNear(state, tr.doc.resolve(range.from), 1);
  if (nextSelection) tr.setSelection(nextSelection);
  view.dispatch(tr);
  return true;
};

/**
 * Backspace removes an orphan empty line at a join barrier, through all three doors:
 * the keymap, `beforeinput`, and Android's DEAD PRESS with no input event.
 */
export const LeadingEmptyParagraphBackspace = Extension.create({
  name: 'leadingEmptyParagraphBackspace',

  addKeyboardShortcuts() {
    return {
      Backspace: () => deleteTrapParagraph(this.editor),
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;

    /** The trapped state an IME-owned key press started in, or null. */
    let pressStartedIn: { doc: PMNode; from: number } | null = null;
    /** Whether that press produced any input at all before its keyup. */
    let pressWrote = false;

    return [
      new Plugin({
        key: new PluginKey('leadingEmptyParagraphBackspaceInput'),
        props: {
          handleDOMEvents: {
            keydown: (view, event) => {
              // A REAL Backspace, answered here rather than in the keymap: PM swallows
              // for 500ms after a composition ends on WebKit.
              if (event.keyCode === BACKSPACE_KEYCODE || event.key === 'Backspace') {
                pressStartedIn = null;
                if (!deleteTrapParagraph(editor)) return false;
                event.preventDefault();
                return true;
              }
              if (event.keyCode !== IME_KEYCODE) {
                pressStartedIn = null;
                return false;
              }
              const range = trapParagraphRange(view.state);
              pressStartedIn = range ? { doc: view.state.doc, from: range.from } : null;
              pressWrote = false;
              return false;
            },

            beforeinput: (_view, event) => {
              pressWrote = true;
              if (event.inputType !== 'deleteContentBackward') return false;
              if (!deleteTrapParagraph(editor)) return false;
              event.preventDefault();
              return true;
            },

            input: () => {
              pressWrote = true;
              return false;
            },

            compositionupdate: () => {
              pressWrote = true;
              return false;
            },

            keyup: (view, event) => {
              const press = pressStartedIn;
              pressStartedIn = null;
              if (!press || pressWrote) return false;
              if (event.keyCode !== IME_KEYCODE) return false;
              // Nothing moved: same document, same trapped paragraph. Anything else
              // means the press was not a refused delete.
              if (view.state.doc !== press.doc) return false;
              const range = trapParagraphRange(view.state);
              if (!range || range.from !== press.from) return false;
              deleteTrapParagraph(editor);
              return false;
            },
          },
        },
      }),
    ];
  },
});
