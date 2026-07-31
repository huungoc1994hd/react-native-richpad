import { type ReactNode } from 'react';
import { GestureResponderEvent, StyleSheet, Text, View } from 'react-native';
import { RichPressable } from '../RichPressable';
import { RichIcon } from '../RichIcon';
import { usePopover } from './PopoverContext';
import { useRichTheme } from '../../context/ThemeContext';

export type PopoverMenuItemProps = {
  onPress?: (e: GestureResponderEvent) => void;
  children: ReactNode;
  isActive?: boolean;
  accessibilityLabel?: string;
};

export const PopoverMenuItem = ({
  onPress,
  children,
  isActive = false,
  accessibilityLabel,
}: PopoverMenuItemProps) => {
  const theme = useRichTheme();
  const { closePopover } = usePopover();

  const handlePress = (e: GestureResponderEvent) => {
    closePopover();
    onPress?.(e);
  };

  return (
    <RichPressable
      onPress={handlePress}
      accessibilityRole="menuitem"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: isActive }}
      // Horizontal only: items are stacked 4pt apart, so a vertical slop would
      // overlap the neighbours' touch areas and make taps near an edge ambiguous.
      hitSlop={{ left: 8, right: 8 }}
      style={[
        styles.item,
        { backgroundColor: isActive ? theme.toolbar.itemActiveBackground : 'transparent' },
      ]}
    >
      {/* Row only for the text form: a custom child brings its own layout. */}
      {typeof children === 'string' || typeof children === 'number' ? (
        <View style={styles.row}>
          <Text
            style={[
              styles.label,
              {
                color: isActive ? theme.toolbar.accent : theme.toolbar.text,
                fontWeight: isActive ? 'bold' : '500',
              },
            ]}
          >
            {children}
          </Text>
          {/* The check ALWAYS takes space (hidden via opacity) so widths don't jump. */}
          <View style={[styles.check, { opacity: isActive ? 1 : 0 }]}>
            <RichIcon name="check" size={16} color={theme.toolbar.accent} />
          </View>
        </View>
      ) : (
        children
      )}
    </RichPressable>
  );
};

const styles = StyleSheet.create({
  item: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 4,
    marginVertical: 2,
    borderRadius: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 16,
  },
  check: {
    marginLeft: 8,
  },
});
