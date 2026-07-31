import { useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { useBridgeState, type EditorBridge } from '@10play/tentap-editor';
import { ToolbarButton } from '../ui/ToolbarButton';
import { RichIcon } from '../ui/RichIcon';
import { PopoverMenu } from '../ui/popover/PopoverMenu';
import { PopoverMenuItem } from '../ui/popover/PopoverMenuItem';
import { TableSizePicker } from '../ui/TableSizePicker';
import { useRichEditorContext } from '../context/RichEditorContext';
import { useRichTheme } from '../context/ThemeContext';
import { useLabels } from '../context/LabelsContext';
import { FocusSuspendReason } from '../hooks/useEditorFocusManager';
import { DEFAULT_FONT_SIZE_OPTIONS } from '../theme/defaults';
import type { HeadingOption } from '../theme/types';
import type { ToolbarItem, TopBarFeatureFlags } from './types';
import { ToolbarDivider } from '../ui/ToolbarDivider';
import { CustomToolbarItems } from './CustomToolbarItems';
import { ToolbarTrigger } from '../ui/ToolbarTrigger';
import { toolbarTargetStyles } from '../ui/toolbarTarget';

/** Debounce for sending the search query to the WebView (ms). */
const SEARCH_DEBOUNCE_MS = 200;

type HeadingLevel = Parameters<EditorBridge['toggleHeading']>[0];

const HEADING_LEVELS: readonly HeadingLevel[] = [1, 2, 3, 4, 5, 6];

/** `editorState.headingLevel` is a bare number; the schema accepts only these. */
const isHeadingLevel = (value: number | undefined): value is HeadingLevel =>
  HEADING_LEVELS.some(level => level === value);

export interface RichEditorTopBarProps {
  /**
   * Pick + optionally upload an image; resolve to the src to insert, or to
   * null/undefined to cancel. The keyboard stays hidden until it settles.
   */
  onPickImage?: (fromCamera: boolean) => Promise<string | null | undefined>;
  /** Toggle built-in tools. Each tool is shown unless set to false. */
  features?: TopBarFeatureFlags;
  /** Custom buttons appended after the built-in tools. */
  items?: ToolbarItem[];
  headingOptions?: HeadingOption[];
  fontSizeOptions?: number[];
  style?: StyleProp<ViewStyle>;
}

/**
 * Top toolbar: history, heading, font size, table, image and in-document search.
 * Must be rendered inside `<RichEditorProvider>`.
 */
export const RichEditorTopBar = ({
  onPickImage,
  features,
  items,
  headingOptions,
  fontSizeOptions = DEFAULT_FONT_SIZE_OPTIONS,
  style,
}: RichEditorTopBarProps) => {
  const { editor, focusManager, resolvedHeadingOptions } = useRichEditorContext();
  const theme = useRichTheme();
  const labels = useLabels();
  const editorState = useBridgeState(editor);

  // The heading options follow the locale unless the consumer overrides them.
  const headings = headingOptions ?? resolvedHeadingOptions;

  const on = (feature: keyof TopBarFeatureFlags) => features?.[feature] !== false;

  const headingLevel = editorState.headingLevel;
  const isHeadingActive = !!headingLevel;
  // No font-size mark = the default size is in use → the menu marks the default.
  // `||`, NOT `??`: an empty string reaches here whenever the selection sits in a
  // textStyle mark that carries no font-size, and `??` would let it through and
  // blank the label.
  const currentFontSize = editorState.fontSize || theme.editor.fontSize;

  // --- In-document search ---
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isSearching) return;
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      editor.setSearchQuery(searchQuery.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
    // editor omitted: its identity changes every render, but the method is a
    // stable proxy over the WebView ref inside tentap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, isSearching]);

  // The search TextInput carries autoFocus — no manual focus timer needed.
  const openSearch = () => {
    setIsSearching(true);
  };

  const closeSearch = () => {
    setIsSearching(false);
    setSearchQuery('');
    editor.clearSearch();
    // Refocus AFTER this unmount, never before: RN issues an explicit
    // hideSoftInput when the focused search input goes away, which would cancel
    // an earlier show. requestFocus is debounced, so it lands once it is gone.
    focusManager.requestFocus();
  };

  const matchCount = editorState.searchMatches ?? 0;
  const matchLabel =
    searchQuery.trim().length === 0
      ? ''
      : matchCount > 0
        ? `${(editorState.searchActiveIndex ?? 0) + 1}/${matchCount}`
        : '0';

  // --- Table ---
  const [isTablePickerOpen, setIsTablePickerOpen] = useState(false);

  const openTablePicker = () => {
    if (editorState.isTableActive) return;
    focusManager.suspend(FocusSuspendReason.TableSheet);
    setIsTablePickerOpen(true);
  };

  // Resume runs in the sheet's onClosed, not here: while its Modal window lives the
  // IME serves that window, so a request from here is rejected (PHASE_CLIENT_VIEW_SERVED).
  const closeTablePicker = () => {
    setIsTablePickerOpen(false);
  };

  // --- Keyboard policy ---
  // Undo/redo/heading/font-size do NOT suspend → the keyboard stays up.
  // Image menu / table picker open an overlay → suspend via focusManager and
  // resume when it closes (cancel) or the action completes → the editor refocuses.
  const handleImageMenuOpen = () => focusManager.suspend(FocusSuspendReason.ImageMenu);
  const handleImageMenuClose = () => focusManager.resume(FocusSuspendReason.ImageMenu);

  // The image flow outlives a render: the picker can stay open while the screen is
  // popped, so the insert and the resume would run against a torn-down editor.
  const mountedRef = useRef(true);
  const pickImageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPickingRef = useRef(false);

  useEffect(() => {
    // Re-armed here, not only at useRef(true): StrictMode mounts, runs the cleanup
    // below, and mounts again with the same refs.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pickImageTimerRef.current) clearTimeout(pickImageTimerRef.current);
      // focusManager OUTLIVES this bar, so a reason left active keeps the keyboard
      // locked for whatever mounts next — and the clearTimeout above may have
      // cancelled the callback that releases it. refocus:false: nothing to focus.
      if (isPickingRef.current) {
        isPickingRef.current = false;
        focusManager.resume(FocusSuspendReason.ImagePicking, { refocus: false });
      }
    };
  }, [focusManager]);

  const pickImage = (fromCamera: boolean) => {
    // Suspend synchronously AT THE TAP: the popover closes right after and would
    // resume image-menu; this reason holds the keyboard down until picking ends.
    focusManager.suspend(FocusSuspendReason.ImagePicking);
    isPickingRef.current = true;
    // 50ms lets RN deliver the popover-dismiss to the native bridge before the
    // picker opens and locks it.
    pickImageTimerRef.current = setTimeout(async () => {
      try {
        const src = await onPickImage?.(fromCamera);
        if (src && mountedRef.current) {
          editor.insertImage(src);
        }
      } catch {
        // The consumer's pick/upload failed — fall through to restore focus.
      } finally {
        // Every path (insert/cancel/error) resumes → the editor refocuses. A newly
        // selected image re-suspends before the debounced refocus, so no flicker.
        // Unmounted mid-flight: the cleanup effect already released the reason.
        isPickingRef.current = false;
        if (mountedRef.current) {
          focusManager.resume(FocusSuspendReason.ImagePicking);
        }
      }
    }, 50);
  };

  const handleSelectHeading = (value: HeadingOption['value']) => {
    if (value === 0) {
      // "Paragraph" (0): toggle the active heading off.
      if (isHeadingLevel(headingLevel)) {
        editor.toggleHeading(headingLevel);
      }
      return;
    }
    editor.toggleHeading(value);
  };

  const menuTriggerColor = (active: boolean) =>
    active ? theme.toolbar.iconActive : theme.toolbar.icon;

  const showTypography = on('heading') || on('fontSize');
  const showInsert = on('table') || on('image');

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: theme.toolbar.surface, borderBottomColor: theme.toolbar.divider },
        style,
      ]}
    >
      <View style={styles.row}>
        {on('history') && (
          <>
            <ToolbarButton
              accessibilityLabel={labels.undo}
              icon="undo"
              onPress={() => editor.undo()}
              disabled={!editorState.canUndo}
            />
            <ToolbarButton
              accessibilityLabel={labels.redo}
              icon="redo"
              onPress={() => editor.redo()}
              disabled={!editorState.canRedo}
            />
          </>
        )}

        {on('history') && showTypography && <ToolbarDivider />}

        {on('heading') && (
          <PopoverMenu
            trigger={(triggerProps, isOpen) => {
              const active = isHeadingActive || isOpen;
              return (
                <ToolbarTrigger onPress={triggerProps.onPress} isActive={active}>
                  <View style={toolbarTargetStyles.row}>
                    <Text style={[styles.headingLabel, { color: menuTriggerColor(active) }]}>
                      Aa
                    </Text>
                    <RichIcon name="arrow-drop-down" size={18} color={menuTriggerColor(active)} />
                  </View>
                </ToolbarTrigger>
              );
            }}
          >
            {headings.map(h => (
              <PopoverMenuItem
                key={h.value}
                onPress={() => handleSelectHeading(h.value)}
                isActive={h.value === 0 ? !isHeadingActive : headingLevel === h.value}
              >
                {h.label}
              </PopoverMenuItem>
            ))}
          </PopoverMenu>
        )}

        {on('fontSize') && (
          <PopoverMenu
            trigger={(triggerProps, isOpen) => (
              <ToolbarTrigger onPress={triggerProps.onPress} isActive={isOpen}>
                <View style={toolbarTargetStyles.row}>
                  <Text style={[styles.fontSizeLabel, { color: menuTriggerColor(isOpen) }]}>
                    {currentFontSize.replace('px', '')}
                  </Text>
                  <RichIcon name="arrow-drop-down" size={18} color={menuTriggerColor(isOpen)} />
                </View>
              </ToolbarTrigger>
            )}
          >
            <View style={styles.fontSizeList}>
              <ScrollView>
                {fontSizeOptions.map(size => (
                  <PopoverMenuItem
                    key={size}
                    onPress={() => editor.setFontSize(`${size}px`)}
                    isActive={currentFontSize === `${size}px`}
                  >
                    {size}
                  </PopoverMenuItem>
                ))}
              </ScrollView>
            </View>
          </PopoverMenu>
        )}

        {showTypography && showInsert && <ToolbarDivider />}

        {on('table') && (
          <ToolbarButton
            accessibilityLabel={labels.insertTable}
            icon="table-chart"
            isActive={editorState.isTableActive}
            onPress={openTablePicker}
          />
        )}

        {on('image') && (
          <PopoverMenu
            onOpen={handleImageMenuOpen}
            onClose={handleImageMenuClose}
            trigger={(triggerProps, isOpen) => (
              <ToolbarButton
                accessibilityLabel={labels.insertImage}
                icon="image"
                isActive={isOpen}
                onPress={triggerProps.onPress}
              />
            )}
          >
            <View>
              <PopoverMenuItem onPress={() => pickImage(false)}>
                <View style={styles.menuItemRow}>
                  <RichIcon name="photo-library" size={18} color={theme.toolbar.icon} />
                  <Text style={[styles.menuItemText, { color: theme.toolbar.text }]}>
                    {labels.imagePickLibrary}
                  </Text>
                </View>
              </PopoverMenuItem>
              <PopoverMenuItem onPress={() => pickImage(true)}>
                <View style={styles.menuItemRow}>
                  <RichIcon name="photo-camera" size={18} color={theme.toolbar.icon} />
                  <Text style={[styles.menuItemText, { color: theme.toolbar.text }]}>
                    {labels.imagePickCamera}
                  </Text>
                </View>
              </PopoverMenuItem>
            </View>
          </PopoverMenu>
        )}

        {on('search') && (
          <ToolbarButton accessibilityLabel={labels.search} icon="search" onPress={openSearch} />
        )}

        <CustomToolbarItems items={items} editor={editor} state={editorState} />
      </View>

      {isSearching && (
        <Animated.View
          entering={FadeInDown.duration(200)}
          exiting={FadeOutUp.duration(150)}
          style={[styles.searchOverlay, { backgroundColor: theme.toolbar.surface }]}
        >
          <View style={styles.searchRow}>
            <RichIcon name="search" size={20} color={theme.toolbar.icon} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={labels.searchPlaceholder}
              placeholderTextColor={theme.toolbar.textMuted}
              autoFocus
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={() => editor.searchNext()}
              style={[styles.searchInput, { color: theme.toolbar.text }]}
            />
            {matchLabel !== '' && (
              <Text style={[styles.matchLabel, { color: theme.toolbar.textMuted }]}>
                {matchLabel}
              </Text>
            )}
            <ToolbarButton
              accessibilityLabel={labels.searchPrev}
              icon="keyboard-arrow-up"
              disabled={matchCount === 0}
              onPress={() => editor.searchPrev()}
            />
            <ToolbarButton
              accessibilityLabel={labels.searchNext}
              icon="keyboard-arrow-down"
              disabled={matchCount === 0}
              onPress={() => editor.searchNext()}
            />
            <ToolbarButton
              accessibilityLabel={labels.searchClose}
              icon="close"
              onPress={closeSearch}
            />
          </View>
        </Animated.View>
      )}

      <TableSizePicker
        visible={isTablePickerOpen}
        onClose={closeTablePicker}
        onClosed={() => focusManager.resume(FocusSuspendReason.TableSheet)}
        onInsert={(rows, cols) => {
          editor.insertTable({ rows, cols, withHeaderRow: true });
          closeTablePicker();
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    width: '100%',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderBottomWidth: 1,
  },
  row: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headingLabel: {
    fontWeight: 'bold',
    fontSize: 18,
  },
  fontSizeLabel: {
    fontWeight: 'bold',
    fontSize: 16,
  },
  fontSizeList: {
    maxHeight: 250,
  },
  menuItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  menuItemText: {
    fontSize: 15,
  },
  searchOverlay: {
    ...StyleSheet.absoluteFill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  searchRow: {
    width: '100%',
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 6,
  },
  matchLabel: {
    fontSize: 13,
    marginRight: 4,
  },
});
