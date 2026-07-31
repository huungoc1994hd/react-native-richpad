import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { WheelPicker } from './WheelPicker';
import { RichPressable } from './RichPressable';
import { useRichTheme } from '../context/ThemeContext';
import { useLabels } from '../context/LabelsContext';

const SIZE_ITEMS = Array.from({ length: 10 }, (_, i) => i + 1);
/** Distance (px) the sheet travels up from below the screen. */
const SHEET_TRAVEL = 480;
const OPEN_MS = 240;
const CLOSE_MS = 200;

export interface TableSizePickerProps {
  visible: boolean;
  onClose: () => void;
  /** Called with the chosen dimensions when the user confirms. */
  onInsert: (rows: number, cols: number) => void;
  /**
   * Fired after the close animation finished AND the Modal unmounted. Restore
   * editor focus here, not in onClose: while the Modal's Android window lives it
   * is the one the input method serves, so a keyboard request from the main
   * window is rejected (ImeTracker `onFailed at PHASE_CLIENT_VIEW_SERVED`).
   */
  onClosed?: () => void;
}

/**
 * Bottom-anchored modal for choosing table dimensions; no @gorhom/bottom-sheet
 * dependency. The Modal's own `animationType` is off so the backdrop can fade
 * while the sheet slides.
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

  /** Tallest container height seen during this open — the window grows as the IME leaves. */
  const tallestHeightRef = useRef(0);
  const settleFrameRef = useRef<number | null>(null);
  const openStartedRef = useRef(false);

  const cancelSettleFrame = () => {
    if (settleFrameRef.current !== null) {
      cancelAnimationFrame(settleFrameRef.current);
      settleFrameRef.current = null;
    }
  };

  const startOpenAnimation = () => {
    if (openStartedRef.current) return;
    openStartedRef.current = true;
    Animated.timing(progress, {
      toValue: 1,
      duration: OPEN_MS,
      useNativeDriver: true,
    }).start();
  };

  /**
   * Starts the slide-up on the first frame after the window stops growing.
   * Under `windowSoftInputMode="adjustResize"` the Modal's window opens while the
   * IME inset still applies — short, its bottom edge travelling down as the
   * keyboard leaves. The sheet is bottom-anchored, so a slide-up started at once
   * runs against a moving anchor and visibly sinks into place. Each growth
   * reschedules; with no keyboard it fires on the next frame. No timers.
   */
  const handleContainerLayout = (event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    if (height <= tallestHeightRef.current) return;
    tallestHeightRef.current = height;
    cancelSettleFrame();
    settleFrameRef.current = requestAnimationFrame(() => {
      settleFrameRef.current = null;
      startOpenAnimation();
    });
  };

  useEffect(() => {
    if (visible) {
      hasOpenedRef.current = true;
      tallestHeightRef.current = 0;
      openStartedRef.current = false;
      // Mount right away; handleContainerLayout decides when to animate.
      setMounted(true);
      return cancelSettleFrame;
    }

    // Nothing to close on the initial mount (visible starts false).
    if (!hasOpenedRef.current) return undefined;

    cancelSettleFrame();
    Animated.timing(progress, {
      toValue: 0,
      duration: CLOSE_MS,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      setMounted(false);
      // Defer past the unmount commit so the Modal's window is really gone first.
      setTimeout(() => onClosedRef.current?.(), 0);
    });
    return undefined;
  }, [visible, progress]);

  if (!mounted) return null;

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [SHEET_TRAVEL, 0],
  });

  return (
    // statusBarTranslucent: the Modal's own Android window does NOT inherit the
    // app's edge-to-edge, so the backdrop would stop at the status bar.
    <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={onClose}>
      <View style={styles.container} onLayout={handleContainerLayout}>
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
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
