import type { RichEditorLabels, HeadingOption } from './theme/types';
import type { EditorLabels } from './protocol';
import { DEFAULT_EDITOR_LABELS } from './protocol';
import { DEFAULT_LABELS, DEFAULT_HEADING_OPTIONS } from './theme/defaults';

/**
 * Every user-facing string for one language. Use a built-in bundle or supply your
 * own; individual fields stay overridable per editor.
 */
export interface RichEditorLocale {
  placeholder: string;
  /** React Native toolbar strings. */
  labels: RichEditorLabels;
  /** In-WebView strings (table-action menu + image caption). */
  editorLabels: EditorLabels;
  /** Heading menu options (value 0 = paragraph). */
  headingOptions: HeadingOption[];
}

export const enLocale: RichEditorLocale = {
  placeholder: 'Start writing…',
  labels: DEFAULT_LABELS,
  editorLabels: DEFAULT_EDITOR_LABELS,
  headingOptions: DEFAULT_HEADING_OPTIONS,
};

export const viLocale: RichEditorLocale = {
  placeholder: 'Bắt đầu soạn thảo nội dung...',
  labels: {
    imagePickLibrary: 'Chọn từ thư viện',
    imagePickCamera: 'Chụp ảnh mới',
    searchPlaceholder: 'Tìm trong ghi chú...',
    textColorTitle: 'Màu chữ',
    highlightColorTitle: 'Màu nền',
    undo: 'Hoàn tác',
    redo: 'Làm lại',
    insertTable: 'Chèn bảng',
    insertImage: 'Chèn ảnh',
    search: 'Tìm kiếm',
    searchPrev: 'Kết quả trước',
    searchNext: 'Kết quả sau',
    searchClose: 'Đóng tìm kiếm',
    taskList: 'Danh sách việc',
    bold: 'In đậm',
    italic: 'In nghiêng',
    underline: 'Gạch chân',
    strikethrough: 'Gạch ngang',
    orderedList: 'Danh sách số',
    bulletList: 'Danh sách gạch đầu dòng',
    selectAll: 'Chọn tất cả',
    clearFormatting: 'Xoá định dạng',
    alignTitle: 'Căn lề',
    alignLeft: 'Căn trái',
    alignCenter: 'Căn giữa',
    alignRight: 'Căn phải',
    alignJustify: 'Căn đều hai bên',
    linkTitle: 'Liên kết',
    linkPlaceholder: 'https://...',
    linkTextPlaceholder: 'Tiêu đề hiển thị (tuỳ chọn)',
    linkApply: 'Gắn liên kết',
    linkUpdate: 'Cập nhật',
    linkRemove: 'Xóa liên kết',
    tableTitle: 'Thuộc tính bảng',
    tableRows: 'Hàng',
    tableColumns: 'Cột',
    tableInsert: 'Hoàn tất',
    colorSwatchesTab: 'Bảng màu',
    colorSpectrumTab: 'Quang phổ',
    colorHexLabel: 'Hex',
    colorRedLabel: 'Đỏ',
    colorGreenLabel: 'Xanh lá',
    colorBlueLabel: 'Xanh dương',
    colorCancel: 'Thoát',
    colorApply: 'Áp dụng',
  },
  editorLabels: {
    addRowAbove: 'Chèn hàng phía trên',
    addRowBelow: 'Chèn hàng phía dưới',
    deleteRow: 'Xóa hàng',
    addColumnLeft: 'Chèn cột bên trái',
    addColumnRight: 'Chèn cột bên phải',
    deleteColumn: 'Xóa cột',
    insertParagraphAbove: 'Chèn văn bản phía trên',
    addRow: 'Thêm hàng',
    addColumn: 'Thêm cột',
    deleteTable: 'Xóa bảng',
    imageCaptionPlaceholder: 'Thêm chú thích…',
  },
  headingOptions: [
    { label: 'Đoạn văn', value: 0 },
    { label: 'Tiêu đề 1', value: 1 },
    { label: 'Tiêu đề 2', value: 2 },
    { label: 'Tiêu đề 3', value: 3 },
  ],
};

/** Built-in locale bundles, keyed by BCP-47-ish code. Extend by passing your own. */
export const BUILTIN_LOCALES = {
  en: enLocale,
  vi: viLocale,
} as const satisfies Record<string, RichEditorLocale>;

export type BuiltinLocaleCode = keyof typeof BUILTIN_LOCALES;

/**
 * The `locale` option: a built-in code (autocompleted), any other code (→ English),
 * or a full custom bundle.
 */
export type LocaleOption = BuiltinLocaleCode | (string & {}) | RichEditorLocale;

// hasOwnProperty.call, not `in` (walks the prototype chain) nor `Object.hasOwn`
// (unpolyfilled on the Hermes of the react-native peer floor).
const isBuiltinLocaleCode = (code: string): code is BuiltinLocaleCode =>
  Object.prototype.hasOwnProperty.call(BUILTIN_LOCALES, code);

/** Resolve the `locale` option: a built-in code, a custom bundle, or undefined (→ English). */
export const resolveLocale = (locale?: LocaleOption): RichEditorLocale => {
  if (!locale) return enLocale;
  if (typeof locale === 'string') {
    return isBuiltinLocaleCode(locale) ? BUILTIN_LOCALES[locale] : enLocale;
  }
  return locale;
};
