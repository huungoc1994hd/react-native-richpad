import { Extension, Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorState } from '@tiptap/pm/state';
import { getScrollContainer } from '../domUtils';

/**
 * IN-NOTE SEARCH — holds state only (query/matches/index; plain JS, so
 * dual-instance safe). SearchOverlay.tsx draws the highlights as overlay boxes
 * portalled into the scroll container, in content coordinates.
 *
 * Do NOT use Decoration: a DecorationSet built from our own prosemirror-view
 * crashes (`localsInner`) against the EditorView inlined in the tentap bundle.
 * Do NOT use the CSS Custom Highlight API: CSS.highlights is undefined in
 * WKWebView (iOS 18) even though Safari has it.
 */

type SearchMatch = { from: number; to: number };
type SearchPluginState = { query: string; matches: SearchMatch[]; activeIndex: number };

type SearchMeta =
  { type: 'set-query'; query: string } | { type: 'step'; dir: 1 | -1 } | { type: 'clear' };

const searchKey = new PluginKey<SearchPluginState>('searchHighlightState');

const EMPTY_STATE: SearchPluginState = { query: '', matches: [], activeIndex: 0 };

/** Scan the whole doc for matches (case-insensitive, within each text node). */
const computeMatches = (doc: EditorState['doc'], query: string): SearchMatch[] => {
  const matches: SearchMatch[] = [];
  const needle = query.toLowerCase();
  if (!needle) return matches;

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return true;
    const haystack = node.text.toLowerCase();
    let index = haystack.indexOf(needle);
    while (index !== -1) {
      matches.push({ from: pos + index, to: pos + index + needle.length });
      index = haystack.indexOf(needle, index + needle.length);
    }
    return true;
  });
  return matches;
};

export const SearchHighlight = Extension.create({
  name: 'searchHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin<SearchPluginState>({
        key: searchKey,
        state: {
          init: () => EMPTY_STATE,
          apply(tr, prev, _oldState, newState) {
            const meta = tr.getMeta(searchKey) as SearchMeta | undefined;
            if (meta) {
              if (meta.type === 'clear') return EMPTY_STATE;
              if (meta.type === 'set-query') {
                const matches = computeMatches(newState.doc, meta.query);
                return { query: meta.query, matches, activeIndex: 0 };
              }
              if (meta.type === 'step' && prev.matches.length > 0) {
                const count = prev.matches.length;
                return {
                  ...prev,
                  activeIndex: (prev.activeIndex + meta.dir + count) % count,
                };
              }
              return prev;
            }
            if (tr.docChanged && prev.query) {
              const matches = computeMatches(newState.doc, prev.query);
              return {
                ...prev,
                matches,
                activeIndex: Math.min(prev.activeIndex, Math.max(0, matches.length - 1)),
              };
            }
            return prev;
          },
        },
      }),
    ];
  },
});

/** Read the current search state (for the bridge's extendEditorState). */
export const getSearchState = (editor: Editor): SearchPluginState =>
  searchKey.getState(editor.state) ?? EMPTY_STATE;

const dispatchMeta = (editor: Editor, meta: SearchMeta) => {
  editor.view.dispatch(editor.state.tr.setMeta(searchKey, meta));
};

/** Scroll the active match to 120px below the container top, once per step. */
const scrollToActiveMatch = (editor: Editor) => {
  const state = getSearchState(editor);
  const match = state.matches[state.activeIndex];
  if (!match) return;
  try {
    const container = getScrollContainer();
    if (!container) return;
    const coords = editor.view.coordsAtPos(match.from);
    const containerTop = container.getBoundingClientRect().top;
    const targetTop = container.scrollTop + (coords.top - containerTop) - 120;
    container.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
  } catch {
    // position could not be resolved (doc just changed) — skip
  }
};

export const setSearchQuery = (editor: Editor, query: string) => {
  dispatchMeta(editor, { type: 'set-query', query });
  scrollToActiveMatch(editor);
};

export const searchStep = (editor: Editor, dir: 1 | -1) => {
  dispatchMeta(editor, { type: 'step', dir });
  scrollToActiveMatch(editor);
};

export const clearSearch = (editor: Editor) => {
  dispatchMeta(editor, { type: 'clear' });
};
