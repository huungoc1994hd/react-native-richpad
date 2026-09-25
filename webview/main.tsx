import './editor.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { EditorContent } from '@tiptap/react';
import { useTenTap } from '@10play/tentap-editor/web';
import { TableHandles } from './TableHandles';
import { TrailingNode } from './TrailingNode';
import { LeadingEmptyParagraphBackspace } from './extensions/leadingEmptyParagraphBackspace';
import { CodeBlockTripleEnterExit } from './extensions/codeBlockTripleEnterExit';
import { CompositionMarkRepair } from './extensions/compositionMarkRepair';
import { CaretReveal } from './extensions/caretReveal';
import { ErrorBoundary } from './ErrorBoundary';
import { IS_ANDROID } from './domUtils';
import { ImageAttrs } from './extensions/imageExtended';
import { Figure, Figcaption } from './figure';
import { ImageNormalizer } from './extensions/imageNormalizer';
import { getSearchState } from './extensions/searchHighlight';
import { PendingFontSize } from './extensions/pendingFontSize';
import { LinkTapHandler } from './extensions/linkTapHandler';
import { LinkEdgeRules } from './extensions/linkEdgeRules';
import { ImageHandles } from './ImageHandles';
import { SearchOverlay } from './SearchOverlay';
import { richpadBridges } from './bridges';
import { BridgeMessageType } from '../src/protocol';

const App = () => {
  const editor = useTenTap({
    bridges: richpadBridges,
    tiptapOptions: {
      // No scrollThreshold/scrollMargin: CaretReveal hands PM's reveal to
      // scrollCoordinator, and tentap overwrites them with zeros anyway.
      extensions: [
        TrailingNode,
        CaretReveal,
        LeadingEmptyParagraphBackspace,
        CodeBlockTripleEnterExit,
        CompositionMarkRepair,
        ImageAttrs,
        ImageNormalizer,
        Figure,
        Figcaption,
        PendingFontSize,
        LinkTapHandler,
        LinkEdgeRules,
      ],
    },
  });

  // RN hangs its first config push and autofocus on this: a state update proves
  // nothing, since an untouched document never produces one.
  React.useEffect(() => {
    if (!editor) return;
    window.ReactNativeWebView?.postMessage(
      JSON.stringify({ type: BridgeMessageType.EditorMounted, payload: undefined }),
    );
  }, [editor]);

  // Debugging handle for the smoke test and Web Inspector sessions.
  React.useEffect(() => {
    if (editor) {
      (window as unknown as { __richpadEditor?: unknown }).__richpadEditor = editor;
      (window as unknown as { __richpadSearchState?: unknown }).__richpadSearchState = () =>
        getSearchState(editor);
    }
  }, [editor]);

  // The one asynchronous reveal left: a finished image load makes the content taller
  // without changing the doc, so PM's own path never runs.
  React.useEffect(() => {
    if (!editor) return;
    const pm = document.querySelector('.ProseMirror');
    if (!pm) return;

    const onAssetLoad = (event: Event) => {
      if (!(event.target instanceof HTMLImageElement)) return;
      try {
        editor.view.dispatch(editor.state.tr.scrollIntoView());
      } catch {
        // The editor is being destroyed mid-flight — ignore.
      }
    };
    // 'load' does not bubble — capture it on the editor subtree itself.
    pm.addEventListener('load', onAssetLoad, true);
    return () => pm.removeEventListener('load', onAssetLoad, true);
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
 * Whether tentap's injected bridge config has landed. It can arrive AFTER this
 * bundle on Android, and an empty map drops every bridge — including Document.
 */
const hasBridgeConfig = (): boolean => {
  try {
    const raw: string | undefined = window.bridgeExtensionConfigMap;
    return !!raw && Object.keys(JSON.parse(raw)).length > 0;
  } catch {
    return false;
  }
};

// Engine class for the few rules in editor.css that must differ per platform.
document.documentElement.classList.add(IS_ANDROID ? 'android' : 'ios');

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = createRoot(rootElement);
  // The boundary must sit ABOVE <App />: useTenTap() itself is what throws, and a
  // boundary inside App would surface as a blank WebView.
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
