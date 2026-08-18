import type { AccessibilityRole } from 'react-native';
import { RichPressable } from './RichPressable';
import { RichIcon, type RichIconName } from './RichIcon';
import { useRichTheme } from '../context/ThemeContext';
import { TOOLBAR_HIT_SLOP, toolbarTargetStyles } from './toolbarTarget';

export interface ToolbarButtonProps {
  icon?: RichIconName;
  isActive?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  /**
   * Defaults to 'button'. Pass 'radio' for one of a mutually exclusive set, so the
   * platform announces it as a choice and reports the active state as `checked`.
   */
  accessibilityRole?: Extract<AccessibilityRole, 'button' | 'radio'>;
  onPress: () => void;
}

/** Shared button for the top and bottom toolbars. */
export const ToolbarButton = ({
  icon,
  isActive = false,
  disabled = false,
  accessibilityLabel,
  accessibilityRole = 'button',
  onPress,
}: ToolbarButtonProps) => {
  const theme = useRichTheme();
  const color = isActive ? theme.toolbar.iconActive : theme.toolbar.icon;

  return (
    <RichPressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={
        accessibilityRole === 'radio'
          ? { checked: isActive, disabled }
          : { selected: isActive, disabled }
      }
      hitSlop={TOOLBAR_HIT_SLOP}
      style={[
        toolbarTargetStyles.target,
        toolbarTargetStyles.row,
        { backgroundColor: isActive ? theme.toolbar.surfaceActive : 'transparent' },
      ]}
    >
      {icon ? <RichIcon name={icon} size={24} color={color} /> : null}
    </RichPressable>
  );
};
