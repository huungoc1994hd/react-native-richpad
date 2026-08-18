import { Extension, Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorState } from '@tiptap/pm/state';
import { getScrollContainer } from '../domUtils';
import { SCROLL_BEHAVIOR } from '../scrollCoordinator';

/**
 * IN-NOTE SEARCH — state only, so it is dual-instance safe; SearchOverlay draws the
 * boxes, because a match must be positioned and `CSS.highlights` is absent in WKWebView.
 */

type SearchMatch = { from: number; to: number };
type SearchPluginState = { query: string; matches: SearchMatch[]; activeIndex: number };

type SearchMeta =
  { type: 'set-query'; query: string } | { type: 'step'; dir: 1 | -1 } | { type: 'clear' };

const searchKey = new PluginKey<SearchPluginState>('searchHighlightState');

const EMPTY_STATE: SearchPluginState = { query: '', matches: [], activeIndex: 0 };

/**
 * Fold to a diacritic-free lowercase form, PRESERVING LENGTH so match offsets stay
 * valid. A character whose fold would change its length keeps its original form.
 */
const foldForSearch = (text: string): string => {
  let out = '';
  for (const ch of text) {
    // Escapes keep this file inside the English-only guard; the characters are
    // the d-with-stroke pair.
    if (ch === '\u0111') {
      out += 'd';
      continue;
    }
    if (ch === '\u0110') {
      out += 'D';
      continue;
    }
    const base = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    out += base.length === ch.length ? base : ch;
  }
  return out.toLowerCase();
};

/** Scan the whole doc for matches (case- and diacritic-insensitive, within each
 * text node — a query typed without accents finds its accented form). */
const computeMatches = (doc: EditorState['doc'], query: string): SearchMatch[] => {
  const matches: SearchMatch[] = [];
  const needle = foldForSearch(query);
  if (!needle) return matches;

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return true;
    const haystack = foldForSearch(node.text);
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
    container.scrollTo({ top: Math.max(0, targetTop), behavior: SCROLL_BEHAVIOR });
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
