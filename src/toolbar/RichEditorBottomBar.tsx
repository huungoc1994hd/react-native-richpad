import { Fragment, useState, type ReactNode } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Animated, { interpolate, useAnimatedStyle } from 'react-native-reanimated';
import { useBridgeState } from '@10play/tentap-editor';
import { useKeyboardSlide } from '../hooks/useKeyboardSlide';
import { ToolbarButton } from '../ui/ToolbarButton';
import { RichPressable } from '../ui/RichPressable';
import { RichIcon, type RichIconName } from '../ui/RichIcon';
import { PopoverMenu } from '../ui/popover/PopoverMenu';
import { usePopover } from '../ui/popover/PopoverContext';
import { ColorPickerModal } from '../ui/ColorPickerModal';
import { useRichEditorContext } from '../context/RichEditorContext';
import { useRichTheme } from '../context/ThemeContext';
import { isSameColor } from '../utils/color';
import type { TextAlignment } from '../protocol';
import { useLabels } from '../context/LabelsContext';
import type { ToolbarItem, BottomBarFeatureFlags } from './types';
import { ToolbarDivider } from '../ui/ToolbarDivider';
import { CustomToolbarItems } from './CustomToolbarItems';
import { ToolbarTrigger } from '../ui/ToolbarTrigger';
import { toolbarTargetStyles } from '../ui/toolbarTarget';

type ColorTarget = 'text' | 'highlight';

const BOTTOM_BAR_ESTIMATED_HEIGHT = 56;

/** Rainbow ring shown around the custom-color button when the color is off-preset. */
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
const normalizeHref = (raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

/** A preset color swatch — closes the popover after selection. */
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

const ClosePopoverButton = () => {
  const theme = useRichTheme();
  const { closePopover } = usePopover();
  return (
    <RichPressable
      onPress={() => closePopover()}
      style={[styles.closeButton, { backgroundColor: theme.toolbar.itemActiveBackground }]}
    >
      <RichIcon name="close" size={16} color={theme.toolbar.icon} />
    </RichPressable>
  );
};

/**
 * Link add/edit popover, laid out like an iOS alert: centered title, inset field,
 * action row split by a hairline. No X button — tap outside to close. Remounts on
 * each open, so the field prefills via useState.
 */
const LinkMenuContent = ({
  initialHref,
  onApply,
  onRemove,
}: {
  initialHref: string;
  onApply: (href: string) => void;
  onRemove: () => void;
}) => {
  const theme = useRichTheme();
  const labels = useLabels();
  const { closePopover } = usePopover();
  const [href, setHref] = useState(initialHref);
  const canApply = href.trim().length > 0;

  return (
    <View style={styles.fullWidth}>
      <Text style={[styles.linkTitle, { color: theme.toolbar.text }]}>{labels.linkTitle}</Text>
      <TextInput
        value={href}
        onChangeText={setHref}
        placeholder={labels.linkPlaceholder}
        placeholderTextColor={theme.toolbar.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        // autoFocus: the URL keyboard is shorter than the editor's (no QuickType bar)
        // → the toolbar drops; PopoverMenu re-measures on keyboard events and follows.
        autoFocus
        clearButtonMode="while-editing"
        style={[
          styles.linkInput,
          // Themed inline, not in the stylesheet: the fixed light palette rendered
          // black text on the dark surface.
          { backgroundColor: theme.toolbar.itemActiveBackground, color: theme.toolbar.text },
        ]}
      />
      <View style={[styles.hairline, { backgroundColor: theme.toolbar.divider }]} />
      <View style={styles.linkActions}>
        {!!initialHref && (
          <>
            <RichPressable
              style={styles.linkAction}
              onPress={() => {
                onRemove();
                closePopover();
              }}
            >
              <View style={styles.linkActionInner}>
                <Text style={[styles.linkActionText, { color: theme.toolbar.danger }]}>
                  {labels.linkRemove}
                </Text>
              </View>
            </RichPressable>
            <View style={[styles.hairlineVertical, { backgroundColor: theme.toolbar.divider }]} />
          </>
        )}
        <RichPressable
          style={styles.linkAction}
          disabled={!canApply}
          onPress={() => {
            if (!canApply) return;
            onApply(normalizeHref(href));
            closePopover();
          }}
        >
          <View style={styles.linkActionInner}>
            <Text
              style={[
                styles.linkActionText,
                styles.linkActionApply,
                { color: canApply ? theme.toolbar.accent : theme.toolbar.textMuted },
              ]}
            >
              {labels.linkApply}
            </Text>
          </View>
        </RichPressable>
      </View>
    </View>
  );
};

/** An alignment choice — closes the popover after selection. */
const AlignmentButton = ({
  align,
  icon,
  label,
  currentAlign,
  onSelect,
}: {
  align: TextAlignment;
  icon: RichIconName;
  label: string;
  currentAlign?: TextAlignment;
  onSelect: (align: TextAlignment) => void;
}) => {
  const { closePopover } = usePopover();
  // No alignment mark means left, so left is active by default.
  const isActive =
    align === 'left' ? !currentAlign || currentAlign === 'left' : currentAlign === align;
  return (
    <ToolbarButton
      icon={icon}
      isActive={isActive}
      accessibilityLabel={label}
      accessibilityRole="radio"
      onPress={() => {
        onSelect(align);
        closePopover();
      }}
    />
  );
};

/** Color menu (text or highlight) with a preset row + a custom-picker opener. */
const ColorMenuContent = ({
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

export interface RichEditorBottomBarProps {
  /** Pin the bar to the keyboard (default true). */
  stickToKeyboard?: boolean;
  /**
   * Extra bottom offset applied while the keyboard is open (e.g. a tab bar /
   * safe area). Distinct from `UseRichEditorOptions.keyboardOffset`, which
   * reserves scroll space above the keyboard.
   */
  bottomOffset?: number;
  /** Toggle built-in tools. Each tool is shown unless set to false. */
  features?: BottomBarFeatureFlags;
  /** Custom buttons appended after the built-in tools. */
  items?: ToolbarItem[];
  style?: StyleProp<ViewStyle>;
}

/**
 * Bottom toolbar: task list, colors, inline formatting, link, lists, alignment,
 * select-all and clear-formatting. Must be rendered inside `<RichEditorProvider>`.
 */
export const RichEditorBottomBar = ({
  stickToKeyboard = true,
  bottomOffset = 0,
  features,
  items,
  style,
}: RichEditorBottomBarProps) => {
  const { editor } = useRichEditorContext();
  const theme = useRichTheme();
  const labels = useLabels();
  const editorState = useBridgeState(editor);

  const on = (feature: keyof BottomBarFeatureFlags) => features?.[feature] !== false;

  const [barHeight, setBarHeight] = useState(BOTTOM_BAR_ESTIMATED_HEIGHT);

  // Slides with the keyboard off the same source as the editor padding. Same
  // geometry as keyboard-controller's KeyboardStickyView, but driven by
  // useKeyboardSlide so it animates on OPEN too (see the hook for why).
  const { height: kbHeight, progress: kbProgress } = useKeyboardSlide();
  const stickyStyle = useAnimatedStyle(
    () => ({
      transform: [
        {
          translateY:
            kbHeight.value + interpolate(kbProgress.value, [0, 1], [barHeight, bottomOffset]),
        },
      ],
    }),
    [barHeight, bottomOffset],
  );

  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<ColorTarget>('text');
  const [tempColor, setTempColor] = useState('#000000');

  const currentTextColor = editorState.activeColor || '#000000';
  const currentHighlightColor = editorState.activeHighlight;

  const getAlignIcon = (): RichIconName => {
    switch (editorState.textAlign) {
      case 'center':
        return 'format-align-center';
      case 'right':
        return 'format-align-right';
      case 'justify':
        return 'format-align-justify';
      default:
        return 'format-align-left';
    }
  };

  const openColorPicker = (target: ColorTarget) => {
    setPickerTarget(target);
    setTempColor(target === 'text' ? currentTextColor : currentHighlightColor || '#FFFF00');
    setIsColorPickerOpen(true);
  };

  const applyColor = (target: ColorTarget, color: string) => {
    if (target === 'text') {
      editor.setColor(color);
    } else {
      editor.setHighlight(color);
    }
  };

  // Scrolling groups, in order. Each present group is joined by a divider.
  const groups: { key: string; node: ReactNode }[] = [];

  if (on('taskList')) {
    groups.push({
      key: 'task',
      node: (
        <ToolbarButton
          accessibilityLabel={labels.taskList}
          icon="check-box"
          isActive={editorState.isTaskListActive}
          onPress={() => editor.toggleTaskList()}
        />
      ),
    });
  }

  if (on('color')) {
    groups.push({
      key: 'color',
      node: (
        <>
          <PopoverMenu
            placement="top"
            contentWidth={280}
            trigger={(triggerProps, isOpen) => (
              <ToolbarTrigger onPress={triggerProps.onPress} isActive={isOpen}>
                <View style={styles.colorTriggerInner}>
                  <Text style={[styles.colorTriggerLetter, { color: theme.toolbar.icon }]}>A</Text>
                  <View style={[styles.colorTriggerBar, { backgroundColor: currentTextColor }]} />
                </View>
              </ToolbarTrigger>
            )}
          >
            <ColorMenuContent
              title={labels.textColorTitle}
              target="text"
              colors={theme.fontColors}
              currentColor={currentTextColor}
              onSelectColor={c => applyColor('text', c)}
              onOpenPicker={openColorPicker}
            />
          </PopoverMenu>

          <PopoverMenu
            placement="top"
            contentWidth={280}
            trigger={(triggerProps, isOpen) => (
              <ToolbarTrigger
                onPress={triggerProps.onPress}
                isActive={isOpen}
                accessibilityLabel={labels.highlightColorTitle}
              >
                <View style={styles.colorTriggerInner}>
                  <View style={styles.colorTriggerIconGlyph}>
                    <RichIcon name="format-color-fill" size={24} color={theme.toolbar.icon} />
                  </View>
                  {/* Falls back to the divider tint rather than to nothing: an invisible
                      swatch reads as a broken icon, while a neutral one reads as "no fill". */}
                  <View
                    style={[
                      styles.colorTriggerBar,
                      { backgroundColor: currentHighlightColor || theme.toolbar.divider },
                    ]}
                  />
                </View>
              </ToolbarTrigger>
            )}
          >
            <ColorMenuContent
              title={labels.highlightColorTitle}
              target="highlight"
              colors={theme.highlightColors}
              currentColor={currentHighlightColor}
              onSelectColor={c => applyColor('highlight', c)}
              onOpenPicker={openColorPicker}
            />
          </PopoverMenu>
        </>
      ),
    });
  }

  if (on('format') || on('link')) {
    groups.push({
      key: 'format',
      node: (
        <>
          {on('format') && (
            <>
              <ToolbarButton
                accessibilityLabel={labels.bold}
                icon="format-bold"
                isActive={editorState.isBoldActive}
                onPress={() => editor.toggleBold()}
              />
              <ToolbarButton
                accessibilityLabel={labels.italic}
                icon="format-italic"
                isActive={editorState.isItalicActive}
                onPress={() => editor.toggleItalic()}
              />
              <ToolbarButton
                accessibilityLabel={labels.underline}
                icon="format-underlined"
                isActive={editorState.isUnderlineActive}
                onPress={() => editor.toggleUnderline()}
              />
              <ToolbarButton
                accessibilityLabel={labels.strikethrough}
                icon="format-strikethrough"
                isActive={editorState.isStrikeActive}
                onPress={() => editor.toggleStrike()}
              />
            </>
          )}

          {/* Link — an inline mark, so it sits at the end of the B/I/U/S cluster */}
          {on('link') && (
            <PopoverMenu
              placement="top"
              contentWidth={300}
              // Any close path (set/remove/tap outside) returns focus to the editor.
              onClose={() => editor.focus(null)}
              trigger={(triggerProps, isOpen) => (
                <ToolbarButton
                  accessibilityLabel={labels.linkTitle}
                  icon="link"
                  isActive={!!editorState.activeLinkHref || isOpen}
                  onPress={triggerProps.onPress}
                />
              )}
            >
              <LinkMenuContent
                initialHref={editorState.activeLinkHref ?? ''}
                onApply={href => editor.setLink(href)}
                onRemove={() => editor.unlink()}
              />
            </PopoverMenu>
          )}
        </>
      ),
    });
  }

  if (on('list')) {
    groups.push({
      key: 'list',
      node: (
        <>
          <ToolbarButton
            accessibilityLabel={labels.orderedList}
            icon="format-list-numbered"
            isActive={editorState.isOrderedListActive}
            onPress={() => editor.toggleOrderedList()}
          />
          <ToolbarButton
            accessibilityLabel={labels.bulletList}
            icon="format-list-bulleted"
            isActive={editorState.isBulletListActive}
            onPress={() => editor.toggleBulletList()}
          />
        </>
      ),
    });
  }

  if (on('align')) {
    groups.push({
      key: 'align',
      node: (
        <PopoverMenu
          placement="top"
          trigger={(triggerProps, isOpen) => (
            <ToolbarTrigger
              onPress={triggerProps.onPress}
              isActive={isOpen}
              accessibilityLabel={labels.alignTitle}
            >
              <View style={[toolbarTargetStyles.row, styles.alignTriggerGap]}>
                <RichIcon name={getAlignIcon()} size={20} color={theme.toolbar.icon} />
                <RichIcon name="arrow-drop-down" size={14} color={theme.toolbar.icon} />
              </View>
            </ToolbarTrigger>
          )}
        >
          {/* radiogroup, not a plain row: the four choices are mutually exclusive,
              so the platform should announce them as a set. */}
          <View style={styles.alignRow} accessibilityRole="radiogroup">
            <AlignmentButton
              align="left"
              icon="format-align-left"
              label={labels.alignLeft}
              currentAlign={editorState.textAlign}
              onSelect={a => editor.setAlign(a)}
            />
            <AlignmentButton
              align="center"
              icon="format-align-center"
              label={labels.alignCenter}
              currentAlign={editorState.textAlign}
              onSelect={a => editor.setAlign(a)}
            />
            <AlignmentButton
              align="right"
              icon="format-align-right"
              label={labels.alignRight}
              currentAlign={editorState.textAlign}
              onSelect={a => editor.setAlign(a)}
            />
            <AlignmentButton
              align="justify"
              icon="format-align-justify"
              label={labels.alignJustify}
              currentAlign={editorState.textAlign}
              onSelect={a => editor.setAlign(a)}
            />
          </View>
        </PopoverMenu>
      ),
    });
  }

  if (items?.length) {
    groups.push({
      key: 'items',
      node: <CustomToolbarItems items={items} editor={editor} state={editorState} />,
    });
  }

  const showSelectAll = on('selectAll');
  const showClearFormat = on('clearFormat');
  const hasPinned = showSelectAll || showClearFormat;

  const bar = (
    <View
      onLayout={event => setBarHeight(event.nativeEvent.layout.height)}
      style={[
        styles.bar,
        { backgroundColor: theme.toolbar.background, borderTopColor: theme.toolbar.divider },
        style,
      ]}
    >
      <View style={styles.barRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.scrollRow}>
            {groups.map((group, index) => (
              <Fragment key={group.key}>
                {index > 0 && <ToolbarDivider />}
                {group.node}
              </Fragment>
            ))}
          </View>
        </ScrollView>

        {/* PINNED right, never scrolls: select-all + clear-formatting are GLOBAL. */}
        {hasPinned && (
          <View style={styles.pinned}>
            <ToolbarDivider />
            {showSelectAll && (
              <ToolbarButton
                accessibilityLabel={labels.selectAll}
                icon="select-all"
                onPress={() => editor.selectAll()}
              />
            )}
            {showClearFormat && (
              <ToolbarButton
                accessibilityLabel={labels.clearFormatting}
                icon="format-clear"
                onPress={() => editor.clearFormatting()}
              />
            )}
          </View>
        )}
      </View>
    </View>
  );

  return (
    <>
      {stickToKeyboard ? (
        <Animated.View style={[styles.sticky, stickyStyle]}>{bar}</Animated.View>
      ) : (
        bar
      )}

      <ColorPickerModal
        isOpen={isColorPickerOpen}
        onClose={() => setIsColorPickerOpen(false)}
        initialColor={tempColor}
        onApply={color => applyColor(pickerTarget, color)}
      />
    </>
  );
};

const styles = StyleSheet.create({
  sticky: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
  },
  bar: {
    width: '100%',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderTopWidth: 1,
  },
  barRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scrollRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pinned: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  swatchActive: {
    transform: [{ scale: 1.1 }],
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
  customColorDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  closeButton: {
    padding: 4,
    borderRadius: 999,
  },
  colorTriggerInner: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 24,
    paddingHorizontal: 8,
  },
  colorTriggerLetter: {
    fontSize: 18,
    fontWeight: 'bold',
    lineHeight: 20,
  },
  colorTriggerIconGlyph: {
    height: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  // One width for both swatches: the two triggers sit side by side, so unequal
  // bars read as unequal thickness even though the height is shared.
  colorTriggerBar: {
    height: 4,
    width: 22,
    marginTop: 1,
  },
  colorMenu: {
    gap: 12,
  },
  colorMenuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  colorMenuTitle: {
    fontSize: 16,
    fontWeight: 'bold',
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
  colorMenuCustom: {
    paddingLeft: 8,
    borderLeftWidth: 1,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  alignTriggerGap: {
    gap: 4,
  },
  alignRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fullWidth: {
    width: '100%',
  },
  linkTitle: {
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 12,
  },
  linkInput: {
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 17,
    marginBottom: 10,
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
  },
  hairlineVertical: {
    width: StyleSheet.hairlineWidth,
  },
  linkActions: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  linkAction: {
    flex: 1,
  },
  linkActionInner: {
    paddingTop: 10,
    paddingBottom: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkActionText: {
    fontSize: 17,
  },
  linkActionApply: {
    fontWeight: '600',
  },
});
