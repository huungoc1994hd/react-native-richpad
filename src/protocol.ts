/**
 * Bridge protocol shared by the RN layer (`src/`) and the WebView bundle
 * (`webview/`, which imports it across the boundary as `../src/protocol`). Single
 * source of truth for message type strings, payload shapes and editor-state
 * shapes. The WebView switches assert exhaustiveness, so an RN→WebView message
 * declared here with no handler is a compile error; the webview→RN direction is
 * dispatched by `if` chains and carries no such guarantee. It lives under `src/`
 * so the contract ships with the package.
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
   * webview → RN: the DOM finished blurring after a ForceBlur. RN must wait for
   * this ack before resigning the native responder — see useEditorFocusManager.
   */
  BlurAck: 'editor-blur-ack',
  /** WebView-internal only (TableHandles) — RN never sends this message. */
  InsertParagraphBeforeTable: 'insert-paragraph-before-table',
  // MediaBridge
  InsertImage: 'insert-image',
  /** webview → RN: image-toolkit selection state turned on/off. */
  ImageToolkitActive: 'image-toolkit-active',
  // ConfigBridge
  InitConfig: 'init-config',
  KeyboardWillShow: 'keyboard-will-show',
  // SearchBridge (in-document find)
  SearchSetQuery: 'search-set-query',
  SearchNext: 'search-next',
  SearchPrev: 'search-prev',
  SearchClear: 'search-clear',
  // FormatBridge (clear formatting + links)
  // NAMING RULE: messages are BROADCAST to every bridge, tentap's built-ins
  // included. A raw string colliding with one of their action types ('set-link',
  // 'set-image', 'toggle-bold', …) runs THEIR handler first with a wrong-shape
  // payload; it may THROW and break the whole dispatch loop. Always prefix.
  ClearFormatting: 'clear-formatting',
  SetLink: 'format-set-link',
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
  /** Height of the area obscured by the keyboard (px, toolbar offset included). */
  height: number;
  /** Keyboard animation duration (ms). */
  duration: number;
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
  /** Placeholder shown in an empty image figcaption. */
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
  /** Accent color (row/column/table/image selection). CSS var: --editor-accent */
  accentColor?: string;
  /** Editor font family. CSS var: --editor-font-family */
  fontFamily?: string;
  /** Default font size (e.g. '16px') for text without a custom size. CSS var: --editor-font-size */
  fontSize?: string;
  /** Document background. CSS var: --editor-background-color */
  backgroundColor?: string;
  /** Body text color. CSS var: --editor-text-color */
  textColor?: string;
  /** Placeholder color. CSS var: --editor-placeholder-color */
  placeholderColor?: string;
  /** Table cell border color. CSS var: --editor-table-border-color */
  tableBorderColor?: string;
  /** Table header background. CSS var: --editor-table-header-bg */
  tableHeaderBackground?: string;
  /** Image caption color. CSS var: --editor-caption-color */
  captionColor?: string;
  /** Search match highlight. CSS var: --editor-search-highlight-bg */
  searchHighlightColor?: string;
  /** Active search match highlight. CSS var: --editor-search-active-bg */
  searchActiveHighlightColor?: string;
  /** Background of the WebView overlay chrome (table popover, image toolbar). CSS var: --editor-surface */
  surfaceColor?: string;
  /** Border of the overlay chrome and of the drag handles. CSS var: --editor-border */
  borderColor?: string;
  /** Icon color inside the overlay chrome. CSS var: --editor-icon */
  iconColor?: string;
  /** Secondary text/icon color inside the overlay chrome. CSS var: --editor-muted */
  mutedColor?: string;
  /** Divider between overlay toolbar groups. CSS var: --editor-divider */
  dividerColor?: string;
  /** Destructive overlay action (delete table/image). CSS var: --editor-danger */
  dangerColor?: string;
};

/** Runtime size limits pushed to the WebView (no rebuild needed after this). */
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

// ===== Per-bridge editor state =====
// Each shape is the first generic argument of its BridgeExtension on BOTH sides,
// and tentap's `BridgeState` augmentation is composed from all of them.

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
  /** Index of the highlighted match within the match list. */
  searchActiveIndex: number;
};

export type FormatBridgeState = {
  /** href of the link at the cursor, null when the cursor is outside a link. */
  activeLinkHref: string | null;
};

// ===== Per-bridge message unions =====

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
  | { type: typeof BridgeMessageType.ForceBlur; payload: undefined };

/** webview → RN: confirms the DOM blur is complete (see the BlurAck note). */
export type BlurAckMessage = {
  type: typeof BridgeMessageType.BlurAck;
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
 * Clear formatting (back to plain text) + set/remove links. SetLink links the
 * selected range (expanding along the mark when the cursor sits inside a link);
 * with no selection it inserts the URL as linked text.
 */
export type FormatBridgeMessage =
  | { type: typeof BridgeMessageType.ClearFormatting; payload: undefined }
  | { type: typeof BridgeMessageType.SetLink; payload: { href: string } }
  | { type: typeof BridgeMessageType.Unlink; payload: undefined }
  | { type: typeof BridgeMessageType.SelectAll; payload: undefined };

/**
 * Insert at the cursor position SAVED when the overlay opened (ForceBlur), not at
 * the current selection — the blur/resignFirstResponder sequence may have reset it
 * while the system picker was open.
 */
export type MediaBridgeMessage = {
  type: typeof BridgeMessageType.InsertImage;
  payload: { src: string };
};

/**
 * webview → RN (MediaBridge.onEditorMessage): an image was selected/deselected.
 * RN suspends the focus manager and dismisses the keyboard natively — a web-side
 * blur alone is not enough, WKWebView restores the first responder on its own and
 * the keyboard flickers back.
 */
export type ImageToolkitActiveMessage = {
  type: typeof BridgeMessageType.ImageToolkitActive;
  /**
   * inCell: image inside a table cell — RN does NOT hide the keyboard (in-table
   * images are small; the user keeps typing). Only top-level images suspend.
   */
  payload: { active: boolean; inCell: boolean };
};
