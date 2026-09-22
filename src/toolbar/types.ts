import { type ReactNode } from 'react';
import type { EditorBridge, BridgeState } from '@10play/tentap-editor';
import type { RichIconName } from '../ui/RichIcon';

/**
 * A custom toolbar entry. Appended after the built-in tools. Provide `icon` +
 * `onPress` for a standard button, or `render` for full control.
 */
export interface ToolbarItem {
  key: string;
  icon?: RichIconName;
  onPress?: (editor: EditorBridge) => void;
  isActive?: (state: BridgeState) => boolean;
  isDisabled?: (state: BridgeState) => boolean;
  /** Screen-reader label for the button. Ignored when `render` is used. */
  accessibilityLabel?: string;
  render?: (ctx: { editor: EditorBridge; state: BridgeState }) => ReactNode;
}

/** Toggle built-in top-bar tools. A tool is shown unless set to false. */
export interface TopBarFeatureFlags {
  /** Undo + redo. */
  history?: boolean;
  heading?: boolean;
  fontSize?: boolean;
  table?: boolean;
  image?: boolean;
  search?: boolean;
}

/** Toggle built-in bottom-bar tools. A tool is shown unless set to false. */
export interface BottomBarFeatureFlags {
  taskList?: boolean;
  /** Text + highlight color. */
  color?: boolean;
  /** Bold, italic, underline, strikethrough. */
  format?: boolean;
  link?: boolean;
  /** Ordered + bullet list. */
  list?: boolean;
  align?: boolean;
  selectAll?: boolean;
  clearFormat?: boolean;
  /** Inline code, code block and its language picker. */
  code?: boolean;
}
