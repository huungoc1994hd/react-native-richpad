import type { HeadingOption, RichEditorLabels, RichTheme } from './types';

/** English default labels for the toolbars. */
export const DEFAULT_LABELS: RichEditorLabels = {
  imagePickLibrary: 'Choose from library',
  imagePickCamera: 'Take a photo',
  searchPlaceholder: 'Search in note…',
  textColorTitle: 'Text color',
  highlightColorTitle: 'Highlight',
  undo: 'Undo',
  redo: 'Redo',
  insertTable: 'Insert table',
  insertImage: 'Insert image',
  search: 'Search',
  searchPrev: 'Previous match',
  searchNext: 'Next match',
  searchClose: 'Close search',
  taskList: 'Task list',
  bold: 'Bold',
  italic: 'Italic',
  underline: 'Underline',
  strikethrough: 'Strikethrough',
  orderedList: 'Numbered list',
  bulletList: 'Bulleted list',
  selectAll: 'Select all',
  clearFormatting: 'Clear formatting',
  alignTitle: 'Alignment',
  alignLeft: 'Align left',
  alignCenter: 'Align center',
  alignRight: 'Align right',
  alignJustify: 'Justify',
  linkTitle: 'Link',
  linkPlaceholder: 'https://…',
  linkApply: 'Set link',
  linkRemove: 'Remove link',
  tableTitle: 'Table properties',
  tableRows: 'Rows',
  tableColumns: 'Columns',
  tableInsert: 'Insert',
  colorSwatchesTab: 'Swatches',
  colorSpectrumTab: 'Spectrum',
  colorHexLabel: 'Hex',
  colorRedLabel: 'Red',
  colorGreenLabel: 'Green',
  colorBlueLabel: 'Blue',
  colorCancel: 'Cancel',
  colorApply: 'Apply',
};

/** Default text-color swatches for the color menu. */
export const DEFAULT_FONT_COLORS = [
  '#000000',
  '#374151',
  '#6B7280',
  '#EF4444',
  '#F59E0B',
  '#10B981',
  '#3B82F6',
  '#6366F1',
  '#8B5CF6',
  '#EC4899',
  '#FFFFFF',
];

/** Default highlight-color swatches for the highlight menu. */
export const DEFAULT_HIGHLIGHT_COLORS = [
  '#FDE047', // yellow
  '#86EFAC', // green
  '#7DD3FC', // blue
  '#F9A8D4', // pink
  '#FDBA74', // orange
  '#67E8F9', // cyan
  '#C4B5FD', // purple
  '#FCA5A5', // red
  '#E5E7EB', // neutral
];

/** Font sizes offered in the top-bar font-size menu. */
export const DEFAULT_FONT_SIZE_OPTIONS = [12, 14, 16, 18, 20, 24, 28, 32];

/** Heading choices in the top-bar heading menu (value 0 = paragraph). */
export const DEFAULT_HEADING_OPTIONS: HeadingOption[] = [
  { label: 'Paragraph', value: 0 },
  { label: 'Heading 1', value: 1 },
  { label: 'Heading 2', value: 2 },
  { label: 'Heading 3', value: 3 },
];

export const lightTheme: RichTheme = {
  mode: 'light',
  toolbar: {
    background: '#F1F5F9',
    surface: '#FFFFFF',
    surfaceActive: '#E2E8F0',
    ripple: 'rgba(0, 0, 0, 0.12)',
    itemActiveBackground: '#F3F4F6',
    divider: '#E5E7EB',
    border: '#D1D5DB',
    icon: '#4B5563',
    iconActive: '#000000',
    text: '#111827',
    textMuted: '#6B7280',
    accent: '#2563EB',
    danger: '#FF3B30',
    shadowColor: 'rgba(0, 0, 0, 0.1)',
  },
  // Paired with the `:root` block in webview/editor.css, which holds the same
  // values as pre-InitConfig fallbacks — keep the two in step.
  editor: {
    accentColor: '#3B82F6',
    fontSize: '16px',
    backgroundColor: '#FFFFFF',
    textColor: '#111827',
    placeholderColor: '#ADB5BD',
    tableBorderColor: '#CED4DA',
    tableHeaderBackground: '#F1F3F5',
    captionColor: '#6B7280',
    searchHighlightColor: 'rgba(250, 204, 21, 0.4)',
    searchActiveHighlightColor: 'rgba(245, 158, 11, 0.55)',
    surfaceColor: '#FFFFFF',
    borderColor: '#D1D5DB',
    iconColor: '#4B5563',
    mutedColor: '#6B7280',
    dividerColor: '#E5E7EB',
    dangerColor: '#FF3B30',
  },
  fontColors: DEFAULT_FONT_COLORS,
  highlightColors: DEFAULT_HIGHLIGHT_COLORS,
};

export const darkTheme: RichTheme = {
  mode: 'dark',
  toolbar: {
    background: '#1F2937',
    surface: '#111827',
    surfaceActive: '#374151',
    ripple: 'rgba(255, 255, 255, 0.16)',
    itemActiveBackground: '#374151',
    divider: '#374151',
    border: '#4B5563',
    icon: '#D1D5DB',
    iconActive: '#FFFFFF',
    text: '#F9FAFB',
    textMuted: '#9CA3AF',
    accent: '#60A5FA',
    danger: '#FF453A',
    shadowColor: 'rgba(0, 0, 0, 0.1)',
  },
  editor: {
    accentColor: '#60A5FA',
    fontSize: '16px',
    backgroundColor: '#0F172A',
    textColor: '#E5E7EB',
    placeholderColor: '#64748B',
    tableBorderColor: '#334155',
    tableHeaderBackground: '#1E293B',
    captionColor: '#94A3B8',
    searchHighlightColor: 'rgba(250, 204, 21, 0.35)',
    searchActiveHighlightColor: 'rgba(245, 158, 11, 0.55)',
    surfaceColor: '#111827',
    borderColor: '#4B5563',
    iconColor: '#D1D5DB',
    mutedColor: '#9CA3AF',
    dividerColor: '#374151',
    dangerColor: '#FF453A',
  },
  fontColors: DEFAULT_FONT_COLORS,
  highlightColors: DEFAULT_HIGHLIGHT_COLORS,
};
