import { useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { Portal } from '@gorhom/portal';
import { WheelPicker } from './WheelPicker';
import { RichPressable } from './RichPressable';
import { useRichTheme } from '../context/ThemeContext';
import { useLabels } from '../context/LabelsContext';
import { DEFAULT_PORTAL_HOST } from './popover/PopoverMenu';

const SIZE_ITEMS = Array.from({ length: 10 }, (_, i) => i + 1);
/** Distance (px) the sheet travels up from below the screen. */
const SHEET_TRAVEL = 480;
/** Paced to sit close to a typical keyboard hide, without tracking it. */
const OPEN_MS = 320;
const CLOSE_MS = 250;

export interface TableSizePickerProps {
  visible: boolean;
  onClose: () => void;
  /** Called with the chosen dimensions when the user confirms. */
  onInsert: (rows: number, cols: number) => void;
  /**
   * Fired after the close animation AND the unmount. Restore focus here, not in
   * onClose: a refocus during teardown races it.
   */
  onClosed?: () => void;
}

/**
 * Bottom sheet for table dimensions, rendered through the SAME-WINDOW portal the
 * popovers use — never an RN Modal, which would fight the closing IME.
 */
export const TableSizePicker = ({ visible, onClose, onInsert, onClosed }: TableSizePickerProps) => {
  const theme = useRichTheme();
  const labels = useLabels();
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);

  // Stay mounted while animating out so the close animation can finish.
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;

  /** True after a real open — gates the close path on first mount. */
  const hasOpenedRef = useRef(false);
  /** Latest onClosed, read without re-running the visibility effect. */
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;

  useEffect(() => {
    if (visible) {
      hasOpenedRef.current = true;
      setMounted(true);
      Animated.timing(progress, {
        toValue: 1,
        duration: OPEN_MS,
        useNativeDriver: true,
      }).start();
      return;
    }

    // Nothing to close on the initial mount (visible starts false).
    if (!hasOpenedRef.current) return;

    Animated.timing(progress, {
      toValue: 0,
      duration: CLOSE_MS,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      setMounted(false);
      // Defer past the unmount commit, so the refocus in onClosed never runs
      // against the overlay tree mid-teardown.
      setTimeout(() => onClosedRef.current?.(), 0);
    });
  }, [visible, progress]);

  // The Android back button must close the sheet — the job RN Modal's
  // onRequestClose did before this became a same-window overlay.
  useEffect(() => {
    if (!visible) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [visible, onClose]);

  if (!mounted) return null;

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [SHEET_TRAVEL, 0],
  });

  return (
    <Portal hostName={DEFAULT_PORTAL_HOST}>
      <View style={styles.overlay}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: progress }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor: theme.toolbar.surface, transform: [{ translateY }] },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: theme.toolbar.border }]} />

          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.toolbar.text }]}>{labels.tableTitle}</Text>
            <RichPressable style={styles.insertButton} onPress={() => onInsert(rows, cols)}>
              <Text style={[styles.insertText, { color: theme.toolbar.accent }]}>
                {labels.tableInsert}
              </Text>
            </RichPressable>
          </View>

          <View style={styles.headerRow}>
            <Text style={[styles.columnLabel, { color: theme.toolbar.textMuted }]}>
              {labels.tableRows}
            </Text>
            <View style={styles.times} />
            <Text style={[styles.columnLabel, { color: theme.toolbar.textMuted }]}>
              {labels.tableColumns}
            </Text>
          </View>

          <View style={styles.pickers}>
            <View style={styles.pickerCol}>
              <WheelPicker items={SIZE_ITEMS} value={rows} onChange={setRows} />
            </View>
            <Text style={[styles.timesSign, { color: theme.toolbar.textMuted }]}>×</Text>
            <View style={styles.pickerCol}>
              <WheelPicker items={SIZE_ITEMS} value={cols} onChange={setCols} />
            </View>
          </View>
        </Animated.View>
      </View>
    </Portal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 999,
    justifyContent: 'flex-end',
  },
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  title: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  insertButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  insertText: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  columnLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '500',
  },
  times: {
    width: 40,
  },
  timesSign: {
    width: 40,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '500',
  },
  pickers: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pickerCol: {
    flex: 1,
  },
});
