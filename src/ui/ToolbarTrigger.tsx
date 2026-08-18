import type { ReactNode } from 'react';
import { RichPressable } from './RichPressable';
import { useRichTheme } from '../context/ThemeContext';
import { TOOLBAR_HIT_SLOP, toolbarTargetStyles } from './toolbarTarget';

export interface ToolbarTriggerProps {
  isActive?: boolean;
  disabled?: boolean;
  /** Required when the content is icon-only: nothing else names the control. */
  accessibilityLabel?: string;
  onPress: () => void;
  children: ReactNode;
}

/**
 * Popover trigger whose content is not a single icon (a label or an icon plus a
 * caret). Icon-only triggers use `ToolbarButton` instead.
 */
export const ToolbarTrigger = ({
  isActive = false,
  disabled = false,
  accessibilityLabel,
  onPress,
  children,
}: ToolbarTriggerProps) => {
  const theme = useRichTheme();

  return (
    <RichPressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: isActive, disabled }}
      hitSlop={TOOLBAR_HIT_SLOP}
      style={[
        toolbarTargetStyles.target,
        { backgroundColor: isActive ? theme.toolbar.surfaceActive : 'transparent' },
      ]}
    >
      {children}
    </RichPressable>
  );
};
