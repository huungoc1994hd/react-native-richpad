import type { EditorTheme } from '../protocol';

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[] ? U[] : T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/** Colors for the React Native toolbars, menus, and popovers. */
export interface RichToolbarTheme {
  /** Background of the top/bottom toolbar bars. */
  background: string;
  /** Background of popover/menu cards. */
  surface: string;
  /** Background of an active (toggled-on) toolbar button. */
  surfaceActive: string;
  /** Background of the highlighted menu item. */
  itemActiveBackground: string;
  /** Dividers between toolbar groups. */
  divider: string;
  /** Borders (bar edges, inputs). */
  border: string;
  /** Default icon/label color. */
  icon: string;
  /** Icon/label color when the button is active. */
  iconActive: string;
  /** Primary text color. */
  text: string;
  /** Secondary/muted text color. */
  textMuted: string;
  /** Destructive actions (e.g. the link popover's Remove). */
  danger: string;
  /** Accent color for selected menu items and check marks. */
  accent: string;
  /**
   * Android press ripple. Must be TRANSLUCENT: it paints over whatever is
   * underneath, including a button that is already showing its active background.
   */
  ripple: string;
  /**
   * Drop-shadow color for floating cards (popovers, the color picker). It is the color
   * of a `boxShadow` and is taken as-is, so include the alpha you want —
   * `'transparent'` removes the shadow.
   */
  shadowColor: string;
}

/**
 * `EditorTheme` after `resolveTheme`: every color is filled from the base theme,
 * so consumers of a resolved theme never need a fallback. `fontFamily` stays
 * optional — leaving it unset means "use the WebView default".
 */
export type ResolvedEditorTheme = Required<Omit<EditorTheme, 'fontFamily'>> &
  Pick<EditorTheme, 'fontFamily'>;

/** The full theme for a RichEditor tree. */
export interface RichTheme {
  mode: 'light' | 'dark';
  /** React Native toolbar/menu colors. */
  toolbar: RichToolbarTheme;
  /** WebView editor theme, mapped onto CSS variables inside the document. */
  editor: ResolvedEditorTheme;
  /** Swatches offered in the text-color menu. */
  fontColors: string[];
  /** Swatches offered in the highlight-color menu. */
  highlightColors: string[];
}

export type RichThemePartial = DeepPartial<RichTheme>;

/** A heading choice in the top-bar heading menu. Value 0 = paragraph. */
export interface HeadingOption {
  label: string;
  value: 0 | 1 | 2 | 3;
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
  linkApply: string;
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
