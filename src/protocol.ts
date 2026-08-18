/**
 * Bridge protocol shared by `src/` and `webview/`. The WebView switches assert
 * exhaustiveness, so an RN→WebView message with no handler fails to compile.
 */

export const BridgeMessageType = {
  // AlignBridge
  SetAlign: 'set-align',
  // FontSizeBridge
  SetFontSize: 'set-font-size',
  UnsetFontSize: 'unset-font-size',
  // TableBridge
  InsertTable: 'insert-table',
  AddRowBefore: 'add-row-before',
  AddRowAfter: 'add-row-after',
  AddColumnBefore: 'add-column-before',
  AddColumnAfter: 'add-column-after',
  DeleteRow: 'delete-row',
  DeleteColumn: 'delete-column',
  DeleteTable: 'delete-table',
  MergeCells: 'merge-cells',
  SplitCell: 'split-cell',
  ForceBlur: 'force-blur',
  /**
   * RN → webview (Android IME dance): return DOM focus to whichever host owns the
   * session. editor.focus(null) is wrong — it would blur a fresh caption.
   */
  RestoreInputFocus: 'restore-input-focus',
  /**
   * webview → RN: the DOM finished blurring after a ForceBlur. RN must wait for
   * this ack before resigning the native responder — see useEditorFocusManager.
   */
  BlurAck: 'editor-blur-ack',
  /** WebView-internal only (TableHandles) — RN never sends this message. */
  InsertParagraphBeforeTable: 'insert-paragraph-before-table',
  // MediaBridge
  InsertImage: 'insert-image',
  /**
   * RN → webview: end the image session WITHOUT focusing the editor, because a host
   * control is about to take the keyboard.
   */
  LeaveImageSession: 'leave-image-session',
  /** webview → RN: image-toolkit selection state turned on/off. */
  ImageToolkitActive: 'image-toolkit-active',
  // ConfigBridge
  InitConfig: 'init-config',
  KeyboardWillShow: 'keyboard-will-show',
  /** webview → RN: the editor exists. The only signal that is not content-dependent. */
  EditorMounted: 'editor-mounted',
  // SearchBridge (in-document find)
  SearchSetQuery: 'search-set-query',
  SearchNext: 'search-next',
  SearchPrev: 'search-prev',
  SearchClear: 'search-clear',
  // FormatBridge. NAMING RULE: messages are BROADCAST to every bridge, tentap's
  // included, so an unprefixed string can run THEIR handler. Always prefix.
  ClearFormatting: 'clear-formatting',
  SetLink: 'format-set-link',
  SaveSelection: 'format-save-selection',
  Unlink: 'format-unlink',
  // 'select-all' collides with nothing today; prefixed anyway per the rule above.
  SelectAll: 'format-select-all',
} as const;

export type TextAlignment = 'left' | 'center' | 'right' | 'justify';

export type TableInsertPayload = {
  rows: number;
  cols: number;
  withHeaderRow: boolean;
};

export type KeyboardWillShowPayload = {
  /**
   * How much of the WebView's BOTTOM the host's chrome covers (px); 0 while the
   * toolbar is parked off screen. The keyboard is NOT in it — quirk 21.
   */
  hostChromeOverlap: number;
};

/** UI labels rendered inside the WebView (table-action popover, image caption). */
export type EditorLabels = {
  addRowAbove: string;
  addRowBelow: string;
  deleteRow: string;
  addColumnLeft: string;
  addColumnRight: string;
  deleteColumn: string;
  insertParagraphAbove: string;
  addRow: string;
  addColumn: string;
  deleteTable: string;
  imageCaptionPlaceholder: string;
};

/** English defaults — the host passes its own labels through InitConfig. */
export const DEFAULT_EDITOR_LABELS: EditorLabels = {
  addRowAbove: 'Insert row above',
  addRowBelow: 'Insert row below',
  deleteRow: 'Delete row',
  addColumnLeft: 'Insert column left',
  addColumnRight: 'Insert column right',
  deleteColumn: 'Delete column',
  insertParagraphAbove: 'Insert text above',
  addRow: 'Add row',
  addColumn: 'Add column',
  deleteTable: 'Delete table',
  imageCaptionPlaceholder: 'Add a caption…',
};

/** Dynamic theme — mapped onto CSS variables inside the WebView. */
export type EditorTheme = {
  /** Accent color (row/column/table/image selection). */
  accentColor?: string;
  fontFamily?: string;
  /** Default font size (e.g. '16px') for text without a custom size. */
  fontSize?: string;
  backgroundColor?: string;
  textColor?: string;
  placeholderColor?: string;
  tableBorderColor?: string;
  tableHeaderBackground?: string;
  captionColor?: string;
  /** Search match highlight. */
  searchHighlightColor?: string;
  /** Active search match highlight. */
  searchActiveHighlightColor?: string;
  /** Background of the WebView overlay chrome (table popover, image toolbar). */
  surfaceColor?: string;
  /** Border of the overlay chrome and of the drag handles. */
  borderColor?: string;
  iconColor?: string;
  /** Secondary text/icon color inside the overlay chrome. */
  mutedColor?: string;
  /** Divider between overlay toolbar groups. */
  dividerColor?: string;
  /** Destructive overlay action (delete table/image). */
  dangerColor?: string;
};

/** Runtime size limits pushed to the WebView. */
export type EditorMetrics = {
  /** Minimum width of a top-level image, as a % of the editor width. Default 15. */
  imageMinWidthPct?: number;
  /** Minimum width of an in-cell image, in px. Default 48. */
  imageMinWidthPx?: number;
  /** Minimum table cell width, in px. Default 70. */
  tableMinCellWidth?: number;
};

export type EditorConfig = {
  labels?: Partial<EditorLabels>;
  theme?: EditorTheme;
  metrics?: EditorMetrics;
};

// Each shape is the first generic argument of its BridgeExtension on BOTH sides.

export type AlignBridgeState = {
  /** Alignment at the cursor; undefined until the WebView sends its first state. */
  textAlign: TextAlignment | undefined;
};

export type FontSizeBridgeState = {
  /** Font size at the cursor (e.g. '16px'); undefined when no size mark applies. */
  fontSize: string | undefined;
};

export type TableBridgeState = {
  isTableActive: boolean;
  canMergeCells: boolean;
  canSplitCell: boolean;
};

export type SearchBridgeState = {
  searchMatches: number;
  searchActiveIndex: number;
};

export type FormatBridgeState = {
  activeLinkHref: string | null;
  activeLinkText: string | null;
  /** Plain text of the selection, capped at 200 chars. */
  selectionText: string;
};

export type AlignBridgeMessage = {
  type: typeof BridgeMessageType.SetAlign;
  payload: TextAlignment;
};

export type FontSizeBridgeMessage =
  | { type: typeof BridgeMessageType.SetFontSize; payload: string }
  | { type: typeof BridgeMessageType.UnsetFontSize; payload: undefined };

export type TableBridgeMessage =
  | { type: typeof BridgeMessageType.InsertTable; payload: TableInsertPayload }
  | { type: typeof BridgeMessageType.AddRowBefore; payload: undefined }
  | { type: typeof BridgeMessageType.AddRowAfter; payload: undefined }
  | { type: typeof BridgeMessageType.AddColumnBefore; payload: undefined }
  | { type: typeof BridgeMessageType.AddColumnAfter; payload: undefined }
  | { type: typeof BridgeMessageType.DeleteRow; payload: undefined }
  | { type: typeof BridgeMessageType.DeleteColumn; payload: undefined }
  | { type: typeof BridgeMessageType.DeleteTable; payload: undefined }
  | { type: typeof BridgeMessageType.MergeCells; payload: undefined }
  | { type: typeof BridgeMessageType.SplitCell; payload: undefined }
  | { type: typeof BridgeMessageType.ForceBlur; payload: undefined }
  | { type: typeof BridgeMessageType.RestoreInputFocus; payload: undefined };

/** webview → RN: confirms the DOM blur is complete (see the BlurAck note). */
export type BlurAckMessage = {
  type: typeof BridgeMessageType.BlurAck;
  payload: undefined;
};

/** webview → RN: sent once per page load, before any transaction can happen. */
export type EditorMountedMessage = {
  type: typeof BridgeMessageType.EditorMounted;
  payload: undefined;
};

export type ConfigBridgeMessage =
  | { type: typeof BridgeMessageType.InitConfig; payload: EditorConfig }
  | { type: typeof BridgeMessageType.KeyboardWillShow; payload: KeyboardWillShowPayload };

/** In-document find: an empty query clears the highlight. */
export type SearchBridgeMessage =
  | { type: typeof BridgeMessageType.SearchSetQuery; payload: { query: string } }
  | { type: typeof BridgeMessageType.SearchNext; payload: undefined }
  | { type: typeof BridgeMessageType.SearchPrev; payload: undefined }
  | { type: typeof BridgeMessageType.SearchClear; payload: undefined };

/**
 * Clear formatting + set/remove links. SetLink expands along the mark when the
 * cursor sits inside a link, and inserts the URL as text when nothing is selected.
 */
export type FormatBridgeMessage =
  | { type: typeof BridgeMessageType.ClearFormatting; payload: undefined }
  | { type: typeof BridgeMessageType.SetLink; payload: { href: string; text?: string } }
  | { type: typeof BridgeMessageType.SaveSelection; payload: undefined }
  | { type: typeof BridgeMessageType.Unlink; payload: undefined }
  | { type: typeof BridgeMessageType.SelectAll; payload: undefined };

/**
 * Insert at the cursor position SAVED when the overlay opened (ForceBlur): the
 * blur sequence may have reset the live selection while the picker was open.
 */
export type MediaBridgeMessage =
  | { type: typeof BridgeMessageType.InsertImage; payload: { src: string } }
  | { type: typeof BridgeMessageType.LeaveImageSession; payload: undefined };

/**
 * webview → RN: an image was selected/deselected. It does not move the keyboard;
 * RN records ownership for imageSessionActive and the consumer callback.
 */
export type ImageToolkitActiveMessage = {
  type: typeof BridgeMessageType.ImageToolkitActive;
  /**
   * inCell: image inside a table cell. captionFocused: a caption holds the keyboard,
   * so RN raises the Android IME for it; optional for older bundles (absent = false).
   */
  payload: { active: boolean; inCell: boolean; captionFocused?: boolean };
};
