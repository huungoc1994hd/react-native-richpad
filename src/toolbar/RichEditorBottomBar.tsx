import { Fragment, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { interpolate, useAnimatedStyle } from 'react-native-reanimated';
import { useBridgeState } from '@10play/tentap-editor';
import { useKeyboardSlide } from '../hooks/useKeyboardSlide';
import { setBottomChromeHeight } from '../hooks/hostChrome';
import { ToolbarButton } from '../ui/ToolbarButton';
import { RichIcon, type RichIconName } from '../ui/RichIcon';
import { PopoverMenu } from '../ui/popover/PopoverMenu';
import { PopoverMenuItem } from '../ui/popover/PopoverMenuItem';
import { usePopover } from '../ui/popover/PopoverContext';
import { ColorMenuContent } from './bottom/ColorMenuContent';
import { LinkMenuContent } from './bottom/LinkMenuContent';
import type { ColorTarget } from './bottom/types';
import { ColorPickerModal } from '../ui/ColorPickerModal';
import { useRichEditorContext } from '../context/RichEditorContext';
import { useRichTheme } from '../context/ThemeContext';
import type { TextAlignment } from '../protocol';
import { useLabels } from '../context/LabelsContext';
import type { ToolbarItem, BottomBarFeatureFlags } from './types';
import { DEFAULT_CODE_LANGUAGES } from '../theme/defaults';
import type { CodeLanguageOption } from '../theme/types';
import { ToolbarDivider } from '../ui/ToolbarDivider';
import { CustomToolbarItems } from './CustomToolbarItems';
import { ToolbarTrigger } from '../ui/ToolbarTrigger';
import { toolbarTargetStyles } from '../ui/toolbarTarget';

const BOTTOM_BAR_ESTIMATED_HEIGHT = 56;

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

export interface RichEditorBottomBarProps {
  /** Pin the bar to the keyboard (default true). */
  stickToKeyboard?: boolean;
  /**
   * Extra bottom offset while the keyboard is open (a tab bar / safe area). Distinct
   * from UseRichEditorOptions.keyboardOffset, which reserves space above this bar.
   */
  bottomOffset?: number;
  /** Toggle built-in tools. Each tool is shown unless set to false. */
  features?: BottomBarFeatureFlags;
  /** Custom buttons appended after the built-in tools. */
  items?: ToolbarItem[];
  /** Languages offered by the code block picker. Defaults to DEFAULT_CODE_LANGUAGES. */
  codeLanguages?: CodeLanguageOption[];
  style?: StyleProp<ViewStyle>;
}

/**
 * Bottom toolbar: task list, colors, inline formatting, inline code, code block with
 * its language picker, link, lists, alignment, select-all and clear-formatting. Must be rendered inside `<RichEditorProvider>`.
 */
export const RichEditorBottomBar = ({
  stickToKeyboard = true,
  bottomOffset = 0,
  features,
  items,
  codeLanguages,
  style,
}: RichEditorBottomBarProps) => {
  const { editor, captionFocused, focusManager } = useRichEditorContext();
  const theme = useRichTheme();
  const labels = useLabels();
  const editorState = useBridgeState(editor);

  const on = (feature: keyof BottomBarFeatureFlags) => features?.[feature] !== false;

  const [barHeight, setBarHeight] = useState(BOTTOM_BAR_ESTIMATED_HEIGHT);

  // Slides off the same source as the editor padding, so bar and content move in
  // lockstep — and unlike KeyboardStickyView it animates on OPEN too.
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

  const codeLanguageOptions = codeLanguages ?? DEFAULT_CODE_LANGUAGES;
  // undefined until the WebView's first state; null = a block with no language.
  const currentCodeLanguage = editorState.codeBlockLanguage ?? null;
  // The web may store an id outside the list: show it as-is rather than as plain text.
  const currentCodeLanguageLabel =
    currentCodeLanguage === null
      ? labels.codeLanguagePlain
      : (codeLanguageOptions.find(option => option.value === currentCodeLanguage)?.label ??
        currentCodeLanguage);

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
                  <View style={styles.colorTriggerGlyph}>
                    <Text style={[styles.colorTriggerLetter, { color: theme.toolbar.icon }]}>
                      A
                    </Text>
                  </View>
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
                  <View style={styles.colorTriggerGlyph}>
                    <RichIcon name="format-color-fill" size={24} color={theme.toolbar.icon} />
                  </View>
                  {/* With no highlight the swatch shows the document background — the
                      color the text actually sits on, not the toolbar's surface. */}
                  <View
                    style={[
                      styles.colorTriggerBar,
                      { backgroundColor: currentHighlightColor || theme.editor.backgroundColor },
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
              // refocusNow MUST run BEFORE this popover unmounts, or RN hides the
              // keyboard along with the field.
              onClose={() => focusManager.refocusNow()}
              trigger={(triggerProps, isOpen) => (
                <ToolbarButton
                  accessibilityLabel={labels.linkTitle}
                  icon="link"
                  isActive={!!editorState.activeLinkHref || isOpen}
                  onPress={() => {
                    // Freeze the selection BEFORE the URL field takes the keyboard:
                    // Android clears the DOM selection when the WebView is unfocused.
                    editor.saveSelection();
                    triggerProps.onPress();
                  }}
                />
              )}
            >
              <LinkMenuContent
                initialHref={editorState.activeLinkHref ?? ''}
                // Editing a link prefills its own text, creating one prefills the
                // selection. Empty means "use the URL".
                initialText={editorState.activeLinkText ?? editorState.selectionText ?? ''}
                onApply={(href, text) => editor.setLink(href, text)}
                onRemove={() => editor.unlink()}
              />
            </PopoverMenu>
          )}
        </>
      ),
    });
  }

  if (on('code')) {
    groups.push({
      key: 'code',
      node: (
        <>
          <ToolbarButton
            accessibilityLabel={labels.inlineCode}
            icon="code"
            isActive={editorState.isCodeActive}
            onPress={() => editor.toggleCode()}
          />
          <ToolbarButton
            accessibilityLabel={labels.codeBlock}
            icon="data-object"
            isActive={editorState.isCodeBlockActive}
            onPress={() => editor.toggleCodeBlock()}
          />
          {/* Language picker: only while the caret is inside a code block */}
          {editorState.isCodeBlockActive && (
            <PopoverMenu
              placement="top"
              contentWidth={220}
              trigger={(triggerProps, isOpen) => (
                <ToolbarTrigger
                  onPress={triggerProps.onPress}
                  isActive={isOpen}
                  accessibilityLabel={labels.codeLanguageTitle}
                >
                  <View style={toolbarTargetStyles.row}>
                    <Text
                      style={[
                        styles.codeLanguageLabel,
                        { color: isOpen ? theme.toolbar.iconActive : theme.toolbar.icon },
                      ]}
                    >
                      {currentCodeLanguageLabel}
                    </Text>
                    <RichIcon
                      name="arrow-drop-down"
                      size={14}
                      color={isOpen ? theme.toolbar.iconActive : theme.toolbar.icon}
                    />
                  </View>
                </ToolbarTrigger>
              )}
            >
              <View style={styles.codeLanguageList}>
                <ScrollView>
                  <PopoverMenuItem
                    isActive={currentCodeLanguage === null}
                    onPress={() => editor.setCodeBlockLanguage(null)}
                  >
                    {labels.codeLanguagePlain}
                  </PopoverMenuItem>
                  {codeLanguageOptions.map(option => (
                    <PopoverMenuItem
                      key={option.value}
                      isActive={currentCodeLanguage === option.value}
                      onPress={() => editor.setCodeBlockLanguage(option.value)}
                    >
                      {option.label}
                    </PopoverMenuItem>
                  ))}
                </ScrollView>
              </View>
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
      onLayout={event => {
        const { height } = event.nativeEvent.layout;
        setBarHeight(height);
        // How much of the WebView this bar covers while the keyboard is up — the
        // page cannot see a native view (see hostChrome).
        setBottomChromeHeight(height + bottomOffset);
      }}
      style={[
        styles.bar,
        { backgroundColor: theme.toolbar.background, borderTopColor: theme.toolbar.divider },
        style,
      ]}
    >
      <View style={styles.barRow}>
        {/* Disabled during caption input: their commands run chain().focus(), which
            steals focus from the caption. Select-all is document-level, so it stays. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={captionFocused ? styles.formatGroupsDisabled : null}
          pointerEvents={captionFocused ? 'none' : 'auto'}
        >
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
            {/* Plain text has no formatting to clear, so this is disabled during
                caption input; its command also runs chain().focus(). */}
            {showClearFormat && (
              <ToolbarButton
                accessibilityLabel={labels.clearFormatting}
                icon="format-clear"
                disabled={captionFocused}
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
  alignRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  alignTriggerGap: {
    gap: 4,
  },
  codeLanguageLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  codeLanguageList: {
    maxHeight: 250,
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
  colorTriggerBar: {
    height: 4,
    width: 22,
    marginTop: 1,
  },
  colorTriggerGlyph: {
    height: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  colorTriggerInner: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 25,
    paddingHorizontal: 8,
  },
  colorTriggerLetter: {
    fontSize: 18,
    fontWeight: 'bold',
    lineHeight: 20,
  },
  formatGroupsDisabled: {
    opacity: 0.35,
  },
  pinned: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scrollRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sticky: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
  },
});
