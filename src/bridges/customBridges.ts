import { BridgeExtension } from '@10play/tentap-editor';
import {
  BridgeMessageType,
  TextAlignment,
  TableInsertPayload,
  EditorConfig,
  KeyboardWillShowPayload,
  AlignBridgeMessage,
  FontSizeBridgeMessage,
  TableBridgeMessage,
  ConfigBridgeMessage,
  EditorMountedMessage,
  MediaBridgeMessage,
  ImageToolkitActiveMessage,
  SearchBridgeMessage,
  FormatBridgeMessage,
  BlurAckMessage,
  AlignBridgeState,
  FontSizeBridgeState,
  TableBridgeState,
  SearchBridgeState,
  FormatBridgeState,
} from '../protocol';

/**
 * The editor uses `customSource`, so every onBridgeMessage and tiptapExtension runs
 * INSIDE the WebView. This side supplies the methods, listeners and module types.
 */
declare module '@10play/tentap-editor' {
  interface EditorBridge {
    setAlign: (alignment: TextAlignment) => void;
    setFontSize: (size: string) => void;
    unsetFontSize: () => void;
    insertTable: (options: TableInsertPayload) => void;
    addRowBefore: () => void;
    addRowAfter: () => void;
    addColumnBefore: () => void;
    addColumnAfter: () => void;
    deleteRow: () => void;
    deleteColumn: () => void;
    deleteTable: () => void;
    mergeCells: () => void;
    splitCell: () => void;
    forceBlurWebView: () => void;
    /** Android IME dance: return DOM focus to the host owning the input session. */
    restoreInputFocus: () => void;
    /**
     * Insert at the cursor position saved when the overlay opened, not the
     * current selection (unlike tentap's setImage) — see MediaBridgeMessage.
     */
    insertImage: (src: string) => void;
    /**
     * End the whole image session without focusing the editor. Call it through
     * RichEditorInstance.leaveImageSession, which also transfers ownership.
     */
    leaveImageSession: () => void;
    /** Push labels + theme to the WebView (call once the editor is alive). */
    setEditorConfig: (config: EditorConfig) => void;
    /**
     * Tell the WebView how much of its bottom the host's toolbar covers, which changes
     * as the keyboard moves that toolbar.
     */
    notifyKeyboardWillShow: (payload: KeyboardWillShowPayload) => void;
    setSearchQuery: (query: string) => void;
    searchNext: () => void;
    searchPrev: () => void;
    clearSearch: () => void;
    clearFormatting: () => void;
    /** Link the selection (or insert the URL as text when nothing is selected). */
    setLink: (href: string, text?: string) => void;
    saveSelection: () => void;
    unlink: () => void;
    /**
     * Select the entire document — document-scoped even during a caption session;
     * in-field select-all belongs to the OS text menu.
     */
    selectAll: () => void;
  }
  interface BridgeState
    extends
      AlignBridgeState,
      FontSizeBridgeState,
      TableBridgeState,
      SearchBridgeState,
      FormatBridgeState {}
}

export const AlignBridge = new BridgeExtension<
  AlignBridgeState,
  { setAlign: (alignment: TextAlignment) => void },
  AlignBridgeMessage
>({
  forceName: 'textAlign',
  extendEditorInstance: sendBridgeMessage => {
    return {
      setAlign: alignment =>
        sendBridgeMessage({ type: BridgeMessageType.SetAlign, payload: alignment }),
    };
  },
});

export const FontSizeBridge = new BridgeExtension<
  FontSizeBridgeState,
  { setFontSize: (size: string) => void; unsetFontSize: () => void },
  FontSizeBridgeMessage
>({
  // MUST be 'textStyle': tentap IGNORES forceName when a bridge has a tiptapExtension,
  // and a name the WebView cannot look up drops the bridge silently (quirk 19).
  forceName: 'textStyle',
  extendEditorInstance: sendBridgeMessage => {
    return {
      setFontSize: size =>
        sendBridgeMessage({ type: BridgeMessageType.SetFontSize, payload: size }),
      unsetFontSize: () =>
        sendBridgeMessage({ type: BridgeMessageType.UnsetFontSize, payload: undefined }),
    };
  },
});

type BlurAckListener = () => void;
const blurAckListeners: BlurAckListener[] = [];

/**
 * "DOM blur finished" ack from the WebView, which the focus manager waits for before
 * resigning native. Same LIFO registry rules as setImageToolkitActiveListener.
 */
export const setBlurAckListener = (listener: BlurAckListener) => {
  blurAckListeners.push(listener);
};

export const clearBlurAckListener = (listener: BlurAckListener) => {
  const index = blurAckListeners.lastIndexOf(listener);
  if (index !== -1) {
    blurAckListeners.splice(index, 1);
  }
};

export const TableBridge = new BridgeExtension<
  TableBridgeState,
  {
    insertTable: (options: TableInsertPayload) => void;
    addRowBefore: () => void;
    addRowAfter: () => void;
    addColumnBefore: () => void;
    addColumnAfter: () => void;
    deleteRow: () => void;
    deleteColumn: () => void;
    deleteTable: () => void;
    mergeCells: () => void;
    splitCell: () => void;
    forceBlurWebView: () => void;
    restoreInputFocus: () => void;
  },
  TableBridgeMessage | BlurAckMessage
>({
  forceName: 'table',
  onEditorMessage: message => {
    if (message.type === BridgeMessageType.BlurAck) {
      const listener: BlurAckListener | undefined = blurAckListeners[blurAckListeners.length - 1];
      listener?.();
      return true;
    }
    return false;
  },
  extendEditorInstance: sendBridgeMessage => {
    return {
      insertTable: options =>
        sendBridgeMessage({ type: BridgeMessageType.InsertTable, payload: options }),
      addRowBefore: () =>
        sendBridgeMessage({ type: BridgeMessageType.AddRowBefore, payload: undefined }),
      addRowAfter: () =>
        sendBridgeMessage({ type: BridgeMessageType.AddRowAfter, payload: undefined }),
      addColumnBefore: () =>
        sendBridgeMessage({ type: BridgeMessageType.AddColumnBefore, payload: undefined }),
      addColumnAfter: () =>
        sendBridgeMessage({ type: BridgeMessageType.AddColumnAfter, payload: undefined }),
      deleteRow: () => sendBridgeMessage({ type: BridgeMessageType.DeleteRow, payload: undefined }),
      deleteColumn: () =>
        sendBridgeMessage({ type: BridgeMessageType.DeleteColumn, payload: undefined }),
      deleteTable: () =>
        sendBridgeMessage({ type: BridgeMessageType.DeleteTable, payload: undefined }),
      mergeCells: () =>
        sendBridgeMessage({ type: BridgeMessageType.MergeCells, payload: undefined }),
      splitCell: () => sendBridgeMessage({ type: BridgeMessageType.SplitCell, payload: undefined }),
      forceBlurWebView: () =>
        sendBridgeMessage({ type: BridgeMessageType.ForceBlur, payload: undefined }),
      restoreInputFocus: () =>
        sendBridgeMessage({ type: BridgeMessageType.RestoreInputFocus, payload: undefined }),
    };
  },
});

type ImageToolkitActiveListener = (
  active: boolean,
  inCell: boolean,
  captionFocused: boolean,
) => void;
const imageToolkitActiveListeners: ImageToolkitActiveListener[] = [];

/**
 * Image-toolkit selection state from the WebView. BridgeExtension instances are
 * module-level, so per-editor dispatch needs this LIFO registry.
 */
export const setImageToolkitActiveListener = (listener: ImageToolkitActiveListener) => {
  imageToolkitActiveListeners.push(listener);
};

export const clearImageToolkitActiveListener = (listener: ImageToolkitActiveListener) => {
  const index = imageToolkitActiveListeners.lastIndexOf(listener);
  if (index !== -1) {
    imageToolkitActiveListeners.splice(index, 1);
  }
};

export const MediaBridge = new BridgeExtension<
  Record<string, never>,
  { insertImage: (src: string) => void; leaveImageSession: () => void },
  MediaBridgeMessage | ImageToolkitActiveMessage
>({
  forceName: 'media',
  extendEditorInstance: sendBridgeMessage => {
    return {
      insertImage: src =>
        sendBridgeMessage({ type: BridgeMessageType.InsertImage, payload: { src } }),
      leaveImageSession: () =>
        sendBridgeMessage({ type: BridgeMessageType.LeaveImageSession, payload: undefined }),
    };
  },
  // WebView → RN messages (RichText routes them to every bridge).
  onEditorMessage: message => {
    if (message.type === BridgeMessageType.ImageToolkitActive) {
      const listener: ImageToolkitActiveListener | undefined =
        imageToolkitActiveListeners[imageToolkitActiveListeners.length - 1];
      listener?.(
        message.payload.active,
        message.payload.inCell,
        message.payload.captionFocused ?? false,
      );
      return true;
    }
    return false;
  },
});

export const SearchBridge = new BridgeExtension<
  SearchBridgeState,
  {
    setSearchQuery: (query: string) => void;
    searchNext: () => void;
    searchPrev: () => void;
    clearSearch: () => void;
  },
  SearchBridgeMessage
>({
  // MUST be 'searchHighlight': the WebView bridge carries a tiptapExtension of
  // that name, which overrides forceName (see the FontSizeBridge note).
  forceName: 'searchHighlight',
  extendEditorInstance: sendBridgeMessage => {
    return {
      setSearchQuery: query =>
        sendBridgeMessage({ type: BridgeMessageType.SearchSetQuery, payload: { query } }),
      searchNext: () =>
        sendBridgeMessage({ type: BridgeMessageType.SearchNext, payload: undefined }),
      searchPrev: () =>
        sendBridgeMessage({ type: BridgeMessageType.SearchPrev, payload: undefined }),
      clearSearch: () =>
        sendBridgeMessage({ type: BridgeMessageType.SearchClear, payload: undefined }),
    };
  },
});

export const FormatBridge = new BridgeExtension<
  FormatBridgeState,
  {
    clearFormatting: () => void;
    setLink: (href: string, text?: string) => void;
    saveSelection: () => void;
    unlink: () => void;
    selectAll: () => void;
  },
  FormatBridgeMessage
>({
  forceName: 'format',
  extendEditorInstance: sendBridgeMessage => {
    return {
      clearFormatting: () =>
        sendBridgeMessage({ type: BridgeMessageType.ClearFormatting, payload: undefined }),
      setLink: (href, text) =>
        sendBridgeMessage({ type: BridgeMessageType.SetLink, payload: { href, text } }),
      saveSelection: () =>
        sendBridgeMessage({ type: BridgeMessageType.SaveSelection, payload: undefined }),
      unlink: () => sendBridgeMessage({ type: BridgeMessageType.Unlink, payload: undefined }),
      selectAll: () => sendBridgeMessage({ type: BridgeMessageType.SelectAll, payload: undefined }),
    };
  },
});

type EditorMountedListener = () => void;
let editorMountedListener: EditorMountedListener | null = null;

/** Called on every page load, including the remount after a renderer crash. */
export const setEditorMountedListener = (listener: EditorMountedListener) => {
  editorMountedListener = listener;
};

export const clearEditorMountedListener = (listener: EditorMountedListener) => {
  if (editorMountedListener === listener) editorMountedListener = null;
};

export const ConfigBridge = new BridgeExtension<
  Record<string, never>,
  {
    setEditorConfig: (config: EditorConfig) => void;
    notifyKeyboardWillShow: (payload: KeyboardWillShowPayload) => void;
  },
  ConfigBridgeMessage | EditorMountedMessage
>({
  forceName: 'editorConfig',
  onEditorMessage: message => {
    if (message.type === BridgeMessageType.EditorMounted) {
      editorMountedListener?.();
      return true;
    }
    return false;
  },
  extendEditorInstance: sendBridgeMessage => {
    return {
      setEditorConfig: config =>
        sendBridgeMessage({ type: BridgeMessageType.InitConfig, payload: config }),
      notifyKeyboardWillShow: payload =>
        sendBridgeMessage({ type: BridgeMessageType.KeyboardWillShow, payload }),
    };
  },
});
