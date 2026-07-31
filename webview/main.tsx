import './editor.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { EditorContent } from '@tiptap/react';
import { useTenTap, TenTapStartKit, BridgeExtension } from '@10play/tentap-editor/web';
// Type-only: setLink/unsetLink module augmentation. The Link runtime already
// ships inside TenTapStartKit.
import type {} from '@tiptap/extension-link';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHandles } from './TableHandles';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { TextAlign } from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { Extension } from '@tiptap/core';
import type { Editor, EditorEvents } from '@tiptap/core';
import { TrailingNode } from './TrailingNode';
import { LeadingEmptyParagraphBackspace } from './extensions/leadingEmptyParagraphBackspace';
import { ErrorBoundary } from './ErrorBoundary';
import { ImageAttrs } from './extensions/imageExtended';
import { Figure, Figcaption } from './extensions/figure';
import { PlaceholderStyleSync } from './extensions/placeholderStyleSync';
import { LinkTapHandler } from './extensions/linkTapHandler';
import {
  SearchHighlight,
  getSearchState,
  setSearchQuery,
  searchStep,
  clearSearch,
} from './extensions/searchHighlight';
import { ImageHandles } from './ImageHandles';
import { SearchOverlay } from './SearchOverlay';
import {
  BridgeMessageType,
  AlignBridgeMessage,
  AlignBridgeState,
  FontSizeBridgeMessage,
  FontSizeBridgeState,
  TableBridgeMessage,
  TableBridgeState,
  ConfigBridgeMessage,
  MediaBridgeMessage,
  SearchBridgeMessage,
  SearchBridgeState,
  FormatBridgeMessage,
  FormatBridgeState,
} from '../src/protocol';
import { applyEditorConfig, getEditorMetrics, keyboardScrollState } from './configStore';
import { assertUnhandled, getScrollContainer } from './domUtils';
import {
  animateScrollForKeyboard,
  cancelKeyboardScroll,
  CURSOR_MARGIN_BOTTOM,
  CURSOR_MARGIN_TOP,
} from './scrollCoordinator';

/**
 * Cursor position frozen at ForceBlur time (RN opening the table sheet / image
 * menu). The blur + resignFirstResponder + system-picker sequence can reset the
 * live selection, so image/table inserts use this position instead.
 */
let savedInsertPos: number | null = null;

const clampPos = (editor: Editor, pos: number) =>
  Math.max(0, Math.min(pos, editor.state.doc.content.size));

/**
 * Move a position that sits INSIDE a figure to AFTER the whole figure block.
 * Inserting into a figure violates the `image figcaption` schema — ProseMirror
 * tears the figure apart and the caption pops out as its own block.
 */
const sanitizeInsertPos = (editor: Editor, pos: number): number => {
  const $pos = editor.state.doc.resolve(clampPos(editor, pos));
  for (let depth = $pos.depth; depth > 0; depth--) {
    if ($pos.node(depth).type.name === 'figure') {
      return $pos.after(depth);
    }
  }
  return $pos.pos;
};

/** Resolve the insert position: saved position first, current selection as fallback — sanitized. */
const takeInsertPos = (editor: Editor): number => {
  const pos = savedInsertPos !== null ? savedInsertPos : editor.state.selection.to;
  savedInsertPos = null;
  return sanitizeInsertPos(editor, pos);
};

const AlignBridge = new BridgeExtension<
  AlignBridgeState,
  Record<string, never>,
  AlignBridgeMessage
>({
  tiptapExtension: TextAlign.configure({ types: ['heading', 'paragraph'] }),
  onBridgeMessage: (editor, message) => {
    switch (message.type) {
      case BridgeMessageType.SetAlign:
        editor.chain().focus().setTextAlign(message.payload).run();
        break;
      default:
        assertUnhandled(message.type);
        break;
    }
    return false;
  },
  extendEditorState: editor => {
    return {
      textAlign: editor.isActive({ textAlign: 'center' })
        ? 'center'
        : editor.isActive({ textAlign: 'right' })
          ? 'right'
          : editor.isActive({ textAlign: 'justify' })
            ? 'justify'
            : 'left',
    };
  },
});

const FontSizeBridge = new BridgeExtension<
  FontSizeBridgeState,
  Record<string, never>,
  FontSizeBridgeMessage
>({
  // TextStyle alone, NOT TextStyleKit: the kit registers tiptap's own FontSize,
  // whose parseHTML is a bare `element.style.fontSize` — it returns '' for an unset
  // property and would silently take over the attribute defined below.
  tiptapExtension: TextStyle,
  tiptapExtensionDeps: [
    Extension.create({
      name: 'fontSizeAttribute',
      addOptions() {
        return { types: ['textStyle'] };
      },
      addGlobalAttributes() {
        return [
          {
            types: this.options.types,
            attributes: {
              fontSize: {
                default: null,
                // `|| null`, not just `?.`: CSSStyleDeclaration returns an EMPTY STRING for
                // a property that was never set, so optional chaining never fires and the
                // attribute lands as '' instead of honouring `default: null`. Content
                // authored on the web carries a textStyle mark for its color but no
                // font-size, so this is the common case, and '' defeats a `??` fallback
                // on the RN side — the toolbar label goes blank.
                parseHTML: element => element.style.fontSize?.replace(/['"]+/g, '') || null,
                renderHTML: attributes => {
                  if (!attributes.fontSize) return {};
                  return { style: `font-size: ${attributes.fontSize}` };
                },
              },
            },
          },
        ];
      },
      addCommands() {
        return {
          setFontSize:
            fontSize =>
            ({ chain }) =>
              chain().setMark('textStyle', { fontSize }).run(),
          unsetFontSize:
            () =>
            ({ chain }) =>
              chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
        };
      },
    }),
  ],
  onBridgeMessage: (editor, message) => {
    switch (message.type) {
      case BridgeMessageType.SetFontSize:
        editor.chain().focus().setFontSize(message.payload).run();
        break;
      case BridgeMessageType.UnsetFontSize:
        editor.chain().focus().unsetFontSize().run();
        break;
      default:
        assertUnhandled(message);
        break;
    }
    return false;
  },
  extendEditorState: editor => {
    return {
      fontSize: editor.getAttributes('textStyle').fontSize,
    };
  },
});

const TableBridge = new BridgeExtension<
  TableBridgeState,
  Record<string, never>,
  TableBridgeMessage
>({
  forceName: 'table',
  tiptapExtension: Table.configure({ resizable: true }),
  tiptapExtensionDeps: [TableRow, TableHeader, TableCell],
  onBridgeMessage: (editor, message) => {
    // Chained commands run EAGERLY at call time; only the dispatch waits for
    // .run(). Every message reaches every bridge (keyboard-will-show, init-config,
    // force-blur), so build the chain lazily — otherwise focus() fires for
    // messages this switch ignores.
    const chain = () => editor.chain().focus();
    switch (message.type) {
      case BridgeMessageType.InsertTable: {
        const { cols } = message.payload;
        // Insert at the pre-blur cursor (see savedInsertPos).
        editor.chain().focus(takeInsertPos(editor)).insertTable(message.payload).run();
        try {
          const state = editor.state;
          const $pos = state.selection.$anchor;
          for (let d = $pos.depth; d > 0; d--) {
            const node = $pos.node(d);
            if (node.type.name === 'table') {
              const tablePos = $pos.before(d);
              // 40 = ProseMirror horizontal padding (18px x 2) + 4px slack for the
              // collapsed 1px table borders, so a full-width table never triggers
              // horizontal scroll.
              const viewportWidth = window.innerWidth - 40;
              const minCellWidth = getEditorMetrics().tableMinCellWidth;
              let targetTableWidth = cols * minCellWidth;
              if (targetTableWidth < viewportWidth) {
                targetTableWidth = viewportWidth;
              }
              const colWidth = Math.floor(targetTableWidth / cols);
              const colwidthArray = [colWidth];
              let tr = state.tr;
              node.descendants((child, pos) => {
                if (child.type.name === 'tableCell' || child.type.name === 'tableHeader') {
                  tr = tr.setNodeMarkup(tablePos + 1 + pos, null, {
                    ...child.attrs,
                    colwidth: colwidthArray,
                  });
                }
              });
              editor.view.dispatch(tr);
              break;
            }
          }
        } catch {
          // Column pre-sizing is best-effort; the table is already inserted.
        }
        break;
      }
      case BridgeMessageType.AddRowBefore:
        chain().addRowBefore().run();
        break;
      case BridgeMessageType.AddRowAfter:
        chain().addRowAfter().run();
        break;
      case BridgeMessageType.AddColumnBefore:
        chain().addColumnBefore().run();
        break;
      case BridgeMessageType.AddColumnAfter:
        chain().addColumnAfter().run();
        break;
      case BridgeMessageType.DeleteRow:
        chain().deleteRow().run();
        break;
      case BridgeMessageType.DeleteColumn:
        chain().deleteColumn().run();
        break;
      case BridgeMessageType.DeleteTable:
        chain().deleteTable().run();
        break;
      case BridgeMessageType.MergeCells:
        chain().mergeCells().run();
        break;
      case BridgeMessageType.SplitCell:
        chain().splitCell().run();
        break;
      case BridgeMessageType.ForceBlur: {
        // Freeze BEFORE blurring — blur/removeAllRanges resets PM's selection.
        savedInsertPos = editor.state.selection.to;
        const activeEl = document.activeElement as HTMLElement | null;
        if (activeEl) activeEl.blur();
        window.getSelection()?.removeAllRanges();
        editor.commands.blur();
        // Ack: DOM focus is fully gone, so RN can resign first responder without
        // WKWebView reclaiming it.
        window.ReactNativeWebView?.postMessage(
          JSON.stringify({ type: BridgeMessageType.BlurAck, payload: undefined }),
        );
        break;
      }
      default:
        assertUnhandled(message);
        break;
    }
    return false;
  },
  extendEditorState: editor => {
    return {
      isTableActive: editor.isActive('table'),
      canMergeCells: editor.can().mergeCells(),
      canSplitCell: editor.can().splitCell(),
    };
  },
});

/**
 * In-note search bridge. NAMING RULE: a bridge carrying a tiptapExtension takes
 * that extension's name ('searchHighlight') — the RN side must forceName the
 * exact same string or the extension is silently never registered.
 */
const SearchBridge = new BridgeExtension<
  SearchBridgeState,
  Record<string, never>,
  SearchBridgeMessage
>({
  tiptapExtension: SearchHighlight,
  onBridgeMessage: (editor, message) => {
    switch (message.type) {
      case BridgeMessageType.SearchSetQuery:
        setSearchQuery(editor, message.payload.query);
        return true;
      case BridgeMessageType.SearchNext:
        searchStep(editor, 1);
        return true;
      case BridgeMessageType.SearchPrev:
        searchStep(editor, -1);
        return true;
      case BridgeMessageType.SearchClear:
        clearSearch(editor);
        return true;
      default:
        assertUnhandled(message);
        break;
    }
    return false;
  },
  extendEditorState: editor => {
    const state = getSearchState(editor);
    return {
      searchMatches: state.matches.length,
      searchActiveIndex: state.activeIndex,
    };
  },
});

/** Formatting-clear + link bridge (the Link extension ships inside TenTapStartKit). */
const FormatBridge = new BridgeExtension<
  FormatBridgeState,
  Record<string, never>,
  FormatBridgeMessage
>({
  forceName: 'format',
  onBridgeMessage: (editor, message) => {
    switch (message.type) {
      case BridgeMessageType.ClearFormatting:
        editor.chain().focus().clearNodes().unsetAllMarks().run();
        return true;
      case BridgeMessageType.SetLink: {
        const href = message.payload.href;
        if (!href) return true;
        const { empty } = editor.state.selection;
        const inLink = !!editor.getAttributes('link').href;
        if (empty && !inLink) {
          // Nothing selected → linked URL text plus ONE plain space, so the
          // cursor escapes the link mark and further typing stays plain.
          editor
            .chain()
            .focus()
            .insertContent([
              {
                type: 'text',
                text: href,
                marks: [{ type: 'link', attrs: { href } }],
              },
              { type: 'text', text: ' ' },
            ])
            .run();
        } else {
          editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
        }
        return true;
      }
      case BridgeMessageType.Unlink:
        editor.chain().focus().extendMarkRange('link').unsetLink().run();
        return true;
      case BridgeMessageType.SelectAll:
        // focus() first so the keyboard / system copy menu work on the selection.
        editor.chain().focus().selectAll().run();
        return true;
      default:
        assertUnhandled(message);
        break;
    }
    return false;
  },
  extendEditorState: editor => {
    return {
      activeLinkHref: (editor.getAttributes('link').href as string | undefined) ?? null,
    };
  },
});

/** Media-insert bridge — inserts at the saved cursor position (see savedInsertPos). */
const MediaBridge = new BridgeExtension<
  Record<string, never>,
  Record<string, never>,
  MediaBridgeMessage
>({
  forceName: 'media',
  onBridgeMessage: (editor, message) => {
    switch (message.type) {
      case BridgeMessageType.InsertImage: {
        const pos = takeInsertPos(editor);
        editor
          .chain()
          .insertContentAt(pos, { type: 'image', attrs: { src: message.payload.src } })
          .setTextSelection(pos + 1)
          .run();
        return true;
      }
      default:
        assertUnhandled(message.type);
        break;
    }
    return false;
  },
});

/** Config bridge — receives labels/theme and keyboard events from RN. */
const ConfigBridge = new BridgeExtension<
  Record<string, never>,
  Record<string, never>,
  ConfigBridgeMessage
>({
  forceName: 'editorConfig',
  onBridgeMessage: (editor, message) => {
    switch (message.type) {
      case BridgeMessageType.InitConfig:
        applyEditorConfig(message.payload);
        return true;
      case BridgeMessageType.KeyboardWillShow:
        // Obscured area lets popovers clamp their position; height 0 = closing.
        keyboardScrollState.obscuredHeight = Math.max(0, message.payload.height);
        if (message.payload.height <= 0) {
          // No new scroll target — letting the animation finish only adds a jolt.
          cancelKeyboardScroll();
          break;
        }
        animateScrollForKeyboard(editor, message.payload.height, message.payload.duration);
        return true;
      default:
        assertUnhandled(message);
        break;
    }
    return false;
  },
});

const customExtensions = [
  ...TenTapStartKit,
  AlignBridge,
  FontSizeBridge,
  TableBridge,
  MediaBridge,
  ConfigBridge,
  SearchBridge,
  FormatBridge,
];

const App = () => {
  const editor = useTenTap({
    bridges: customExtensions,
    tiptapOptions: {
      extensions: [
        TrailingNode,
        LeadingEmptyParagraphBackspace,
        ImageAttrs,
        Figure,
        Figcaption,
        PlaceholderStyleSync,
        LinkTapHandler,
      ],
      onFocus: ({ editor }: EditorEvents['focus']) => {
        setTimeout(() => {
          // scrollCoordinator owns scrollTop while it is active.
          if (keyboardScrollState.active) return;
          editor.commands.scrollIntoView();
        }, 50);
      },
      onSelectionUpdate: ({ editor }: EditorEvents['selectionUpdate']) => {
        if (keyboardScrollState.active) return;
        editor.commands.scrollIntoView();
      },
    },
  });

  // Keep the cursor in view on viewport resize and DOM mutation (image loads,
  // table edits); the keyboard scroll coordinator wins whenever it is active.
  React.useEffect(() => {
    if (!editor) return;
    const pm = document.querySelector('.ProseMirror');
    if (!pm) return;

    // Both observers fire in bursts (one table edit mutates dozens of nodes) and
    // coordsAtPos forces a sync layout — keep at most one pending pass.
    let scrollTimer: number | undefined;

    const autoScrollToCursor = () => {
      if (keyboardScrollState.active) return;
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        if (!editor || !editor.view || keyboardScrollState.active) return;
        try {
          const { head } = editor.state.selection;
          const coords = editor.view.coordsAtPos(head);
          const scrollContainer = getScrollContainer();
          if (scrollContainer && coords) {
            const containerRect = scrollContainer.getBoundingClientRect();
            if (coords.bottom > containerRect.bottom - CURSOR_MARGIN_BOTTOM) {
              scrollContainer.scrollTop +=
                coords.bottom - containerRect.bottom + CURSOR_MARGIN_BOTTOM;
            } else if (coords.top < containerRect.top + CURSOR_MARGIN_TOP) {
              scrollContainer.scrollTop -= containerRect.top + CURSOR_MARGIN_TOP - coords.top;
            }
          }
        } catch {
          // coordsAtPos throws on positions invalidated by a concurrent edit.
        }
      }, 50);
    };

    const resizeObserver = new ResizeObserver(() => {
      autoScrollToCursor();
    });
    resizeObserver.observe(pm);

    const mutationObserver = new MutationObserver(() => {
      autoScrollToCursor();
    });
    mutationObserver.observe(pm, { childList: true, subtree: true });

    window.addEventListener('resize', autoScrollToCursor);

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener('resize', autoScrollToCursor);
      window.clearTimeout(scrollTimer);
    };
  }, [editor]);

  return (
    <>
      <EditorContent editor={editor} />
      {editor ? <TableHandles editor={editor} /> : null}
      {editor ? <ImageHandles editor={editor} /> : null}
      {editor ? <SearchOverlay editor={editor} /> : null}
    </>
  );
};

/**
 * Whether tentap's injected bridge config has landed yet.
 *
 * tentap injects `window.bridgeExtensionConfigMap` via
 * `injectedJavaScriptBeforeContentLoaded`; with richpad's inline-HTML
 * `customSource` it can land AFTER this bundle runs on Android (tentap's own
 * file-URI source rarely loses that race). `useTenTap` reads the map once
 * (useMemo []); an empty map drops EVERY bridge including the core Document
 * node, so ProseMirror throws "Schema is missing its top node type ('doc')" and
 * the editor renders blank. Gate first render on a populated map.
 */
const hasBridgeConfig = (): boolean => {
  try {
    const raw: string | undefined = window.bridgeExtensionConfigMap;
    return !!raw && Object.keys(JSON.parse(raw)).length > 0;
  } catch {
    return false;
  }
};

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = createRoot(rootElement);
  // The boundary must sit ABOVE <App />: the documented failure is useTenTap()
  // itself throwing ("Schema is missing its top node type"), and a boundary
  // inside App is below the throw — that would surface as a blank WebView.
  const mount = () =>
    root.render(
      <ErrorBoundary>
        <App />
      </ErrorBoundary>,
    );
  if (hasBridgeConfig()) {
    // iOS, and Android when it wins the race.
    mount();
  } else {
    // Poll for the late Android injection. The ~5s ceiling is a safety valve:
    // if the config never arrives, mount anyway so the real error surfaces.
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      if (hasBridgeConfig() || tries >= 200) {
        window.clearInterval(timer);
        mount();
      }
    }, 25);
  }
}
