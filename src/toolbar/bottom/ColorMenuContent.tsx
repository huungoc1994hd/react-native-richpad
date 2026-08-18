import { ScrollView, StyleSheet, Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { RichPressable } from '../../ui/RichPressable';
import { RichIcon } from '../../ui/RichIcon';
import { useRichTheme } from '../../context/ThemeContext';
import { usePopover } from '../../ui/popover/PopoverContext';
import { ClosePopoverButton } from './ClosePopoverButton';
import { isSameColor } from '../../utils/color';
import type { ColorTarget } from './types';

/** Rainbow ring around the custom-colour trigger. */
const RAINBOW_GRADIENT = [
  '#FF3B30',
  '#FF9500',
  '#FFCC00',
  '#4CD964',
  '#5AC8FA',
  '#007AFF',
  '#5856D6',
];

const isPreset = (colors: string[], color?: string) => colors.some(c => isSameColor(c, color));

/** Normalize a user-entered URL: default the scheme to https:// when missing. */

const ColorSwatchButton = ({
  color,
  isActive,
  onSelect,
}: {
  color: string;
  isActive: boolean;
  onSelect: (color: string) => void;
}) => {
  const theme = useRichTheme();
  const { closePopover } = usePopover();
  return (
    <RichPressable
      onPress={() => {
        onSelect(color);
        closePopover();
      }}
      noFeedback
      accessibilityRole="button"
      accessibilityLabel={color}
      accessibilityState={{ selected: isActive }}
      style={[
        styles.swatch,
        {
          backgroundColor: color,
          borderWidth: isActive ? 2 : 1,
          borderColor: isActive ? theme.toolbar.accent : theme.toolbar.divider,
        },
        isActive ? styles.swatchActive : null,
      ]}
    ></RichPressable>
  );
};

/** Opens the color picker — shows a gradient ring when the current color is off-preset. */
const CustomColorButton = ({
  target,
  colors,
  currentColor,
  onOpenPicker,
}: {
  target: ColorTarget;
  colors: string[];
  currentColor?: string;
  onOpenPicker: (target: ColorTarget) => void;
}) => {
  const theme = useRichTheme();
  const { closePopover } = usePopover();

  const presetActive =
    target === 'text'
      ? isPreset(colors, currentColor)
      : !currentColor || isPreset(colors, currentColor);

  const handleOpen = () => {
    onOpenPicker(target);
    closePopover();
  };

  if (presetActive) {
    return (
      <RichPressable
        onPress={handleOpen}
        style={[styles.customColorPlus, { backgroundColor: theme.toolbar.itemActiveBackground }]}
      >
        <RichIcon name="add" size={16} color={theme.toolbar.icon} />
      </RichPressable>
    );
  }
  return (
    <RichPressable onPress={handleOpen} noFeedback>
      <LinearGradient
        colors={RAINBOW_GRADIENT}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.customColorRing}
      >
        <View style={[styles.customColorRingInner, { backgroundColor: theme.toolbar.surface }]}>
          <View style={[styles.customColorDot, { backgroundColor: currentColor }]} />
        </View>
      </LinearGradient>
    </RichPressable>
  );
};

export const ColorMenuContent = ({
  title,
  target,
  colors,
  currentColor,
  onSelectColor,
  onOpenPicker,
}: {
  title: string;
  target: ColorTarget;
  colors: string[];
  currentColor?: string;
  onSelectColor: (color: string) => void;
  onOpenPicker: (target: ColorTarget) => void;
}) => {
  const theme = useRichTheme();
  return (
    <View style={styles.colorMenu}>
      <View style={styles.colorMenuHeader}>
        <Text style={[styles.colorMenuTitle, { color: theme.toolbar.text }]}>{title}</Text>
        <ClosePopoverButton />
      </View>

      <View style={styles.colorMenuRow}>
        <View style={styles.colorMenuScroll}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.colorMenuSwatches}>
              {colors.map(c => (
                <ColorSwatchButton
                  key={c}
                  color={c}
                  isActive={isSameColor(currentColor, c)}
                  onSelect={onSelectColor}
                />
              ))}
            </View>
          </ScrollView>
        </View>

        <View style={[styles.colorMenuCustom, { borderLeftColor: theme.toolbar.divider }]}>
          <CustomColorButton
            target={target}
            colors={colors}
            currentColor={currentColor}
            onOpenPicker={onOpenPicker}
          />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  colorMenu: {
    gap: 12,
  },
  colorMenuCustom: {
    paddingLeft: 8,
    borderLeftWidth: 1,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  colorMenuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  colorMenuRow: {
    flexDirection: 'row',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  colorMenuScroll: {
    flex: 1,
  },
  colorMenuSwatches: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
    paddingLeft: 8,
    paddingRight: 24,
  },
  colorMenuTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  customColorDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  customColorPlus: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customColorRing: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customColorRingInner: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  swatchActive: {
    transform: [{ scale: 1.1 }],
  },
});
