// Public API surface. Internals are deliberately not exported; the focus manager is
// reachable via `instance.focusManager`.

// Do NOT weaken to `import type`: this file carries the tentap `declare module`
// augmentation, and only a bare side-effect import survives into the .d.ts.
import './bridges/customBridges';
export { RichEditorProvider } from './RichEditorProvider';
export { RichEditor } from './RichEditor';
export { RichEditorTopBar } from './toolbar/RichEditorTopBar';
export { RichEditorBottomBar } from './toolbar/RichEditorBottomBar';
export { useRichEditor } from './hooks/useRichEditor';
// For custom toolbar items that match the built-ins; usable anywhere under RichEditorProvider.
export { useRichTheme } from './context/ThemeContext';
export { useLabels } from './context/LabelsContext';
export { ToolbarButton } from './ui/ToolbarButton';
export type { ToolbarButtonProps } from './ui/ToolbarButton';
export {
  lightTheme,
  darkTheme,
  DEFAULT_LABELS,
  DEFAULT_CODE_LANGUAGES,
  DEFAULT_HEADING_OPTIONS,
  DEFAULT_FONT_SIZE_OPTIONS,
  DEFAULT_FONT_COLORS,
  DEFAULT_HIGHLIGHT_COLORS,
} from './theme/defaults';
export { DEFAULT_EDITOR_LABELS } from './protocol';
export { enLocale, viLocale, BUILTIN_LOCALES, resolveLocale } from './locale';
export type { RichEditorLocale, BuiltinLocaleCode, LocaleOption } from './locale';
export type { RichEditorProviderProps } from './RichEditorProvider';
export type { RichEditorProps, RichEditorRef } from './RichEditor';
export type { UseRichEditorOptions, RichEditorInstance } from './hooks/useRichEditor';
export type { RichEditorTopBarProps } from './toolbar/RichEditorTopBar';
export type { RichEditorBottomBarProps } from './toolbar/RichEditorBottomBar';
export type { ToolbarItem, TopBarFeatureFlags, BottomBarFeatureFlags } from './toolbar/types';
export type {
  RichTheme,
  RichThemePartial,
  RichToolbarTheme,
  ResolvedEditorTheme,
  RichEditorLabels,
  HeadingOption,
  CodeLanguageOption,
} from './theme/types';
export type { RichIconName } from './ui/RichIcon';
export type { RenderIcon } from './context/IconContext';
export type { EditorFocusManager } from './hooks/useEditorFocusManager';
// Reasons the library itself suspends focus for — custom reason strings must not
// collide. Reasons live in a set: suspending one twice still resumes on the first resume.
export { FocusSuspendReason } from './hooks/useEditorFocusManager';
// tentap's editor handle + toolbar state, as surfaced across the public API.
export type { EditorBridge, BridgeState } from '@10play/tentap-editor';
export type {
  TextAlignment,
  EditorTheme,
  EditorMetrics,
  EditorLabels,
  EditorConfig,
} from './protocol';
// tentap is bundled, not a peer, so consumers do not install it themselves.
export * as tentap from '@10play/tentap-editor';
