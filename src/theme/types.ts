import type { EditorTheme } from '../protocol';

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[] ? U[] : T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/** Colors for the React Native toolbars, menus, and popovers. */
export interface RichToolbarTheme {
  /** Background of the top/bottom toolbar bars. */
  background: string;
  surface: string;
  surfaceActive: string;
  itemActiveBackground: string;
  divider: string;
  border: string;
  icon: string;
  iconActive: string;
  text: string;
  textMuted: string;
  /** Destructive actions (e.g. the link popover's Remove). */
  danger: string;
  accent: string;
  /**
   * Android press ripple. Must be TRANSLUCENT: it paints over whatever is
   * underneath, including a button that is already showing its active background.
   */
  ripple: string;
  /**
   * Drop-shadow colour for floating cards, taken as-is — include the alpha you want;
   * 'transparent' removes the shadow.
   */
  shadowColor: string;
}

/**
 * `EditorTheme` after resolveTheme: every colour filled in, so consumers need no
 * fallback. `fontFamily` stays optional — unset means the WebView default.
 */
export type ResolvedEditorTheme = Required<Omit<EditorTheme, 'fontFamily'>> &
  Pick<EditorTheme, 'fontFamily'>;

/** The full theme for a RichEditor tree. */
export interface RichTheme {
  mode: 'light' | 'dark';
  toolbar: RichToolbarTheme;
  editor: ResolvedEditorTheme;
  fontColors: string[];
  highlightColors: string[];
}

export type RichThemePartial = DeepPartial<RichTheme>;

/** A heading choice in the top-bar heading menu. Value 0 = paragraph. */
export interface HeadingOption {
  label: string;
  value: 0 | 1 | 2 | 3;
}

/** A language choice in the bottom-bar code block picker. */
export interface CodeLanguageOption {
  label: string;
  /** highlight.js id as the web editor writes it in the Markdown fence, e.g. 'javascript'. */
  value: string;
}

/** All user-facing strings in the React Native toolbars (i18n surface). */
export interface RichEditorLabels {
  // Top-bar image menu.
  imagePickLibrary: string;
  imagePickCamera: string;
  // Top-bar search.
  searchPlaceholder: string;
  // Bottom-bar color menus.
  textColorTitle: string;
  highlightColorTitle: string;
  /** Screen-reader name for the alignment menu: its trigger is icon-only. */
  alignTitle: string;
  // Screen-reader names for the icon-only toolbar controls. Icon glyphs carry no
  // text, so without these a screen reader announces an unnamed button.
  undo: string;
  redo: string;
  insertTable: string;
  insertImage: string;
  search: string;
  searchPrev: string;
  searchNext: string;
  searchClose: string;
  taskList: string;
  bold: string;
  italic: string;
  underline: string;
  strikethrough: string;
  inlineCode: string;
  codeBlock: string;
  /** Screen-reader name of the code language picker trigger. */
  codeLanguageTitle: string;
  /** First picker entry: no language. */
  codeLanguagePlain: string;
  orderedList: string;
  bulletList: string;
  selectAll: string;
  clearFormatting: string;
  // Alignment choices. Icon-only, so these are the only names they have.
  alignLeft: string;
  alignCenter: string;
  alignRight: string;
  alignJustify: string;
  // Bottom-bar link menu.
  linkTitle: string;
  linkPlaceholder: string;
  linkTextPlaceholder: string;
  linkApply: string;
  /** Submit label when the popover edits an existing link instead of creating one. */
  linkUpdate: string;
  linkRemove: string;
  // Table size picker.
  tableTitle: string;
  tableRows: string;
  tableColumns: string;
  tableInsert: string;
  // Color picker modal.
  colorSwatchesTab: string;
  colorSpectrumTab: string;
  colorHexLabel: string;
  colorRedLabel: string;
  colorGreenLabel: string;
  colorBlueLabel: string;
  colorCancel: string;
  colorApply: string;
}
