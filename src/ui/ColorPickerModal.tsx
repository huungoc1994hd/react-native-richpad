import { useState, useEffect } from 'react';
import { View, Text, Modal, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LinearGradient from 'react-native-linear-gradient';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';

import {
  hsvToRgb,
  rgbToHex,
  hexToRgb,
  rgbToHsv,
  generateSwatches,
  isSameColor,
  SWATCH_COLUMNS,
} from '../utils/color';
import { useLabels } from '../context/LabelsContext';
import { useRichTheme } from '../context/ThemeContext';
import { RichPressable } from './RichPressable';

const SWATCHES = generateSwatches();
const HISTORY_KEY = '@react-native-richpad/color_history';

/** Number of history entries persisted; saveHistory trims and pads to this length. */
const HISTORY_SLOTS = 6;
const DEFAULT_HISTORY = ['#333333', '#666666', '#999999', '#CCCCCC', '#EEEEEE', '#FFFFFF'];

// Geometry derives from the MODAL width (kept in sync with styles.modalContent):
// window-derived widths overflowed the fixed-width card on wide devices.
const MODAL_WIDTH = 340;
const MODAL_PADDING = 16;
const CONTENT_WIDTH = MODAL_WIDTH - MODAL_PADDING * 2;

/** Slider geometry: the wrapper's touch padding and the thumb radius drive the stylesheet and the clamp math. */
const SLIDER_TOUCH_PAD = 14;
const SLIDER_THUMB_RADIUS = 7;

/** Spectrum geometry: the pad is virtual touch slop around the gradient, so the gesture math subtracts it. */
const SPECTRUM_WIDTH = CONTENT_WIDTH; // spans the card content, no overflow
const SPECTRUM_HEIGHT = 190;
const SPECTRUM_PAD = 12;

/** Swatch cell height; the grid's column count comes from the palette. */
const SWATCH_CELL_HEIGHT = 25;

interface ColorPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialColor: string;
  onApply: (color: string) => void;
}

export const ColorPickerModal = ({
  isOpen,
  onClose,
  initialColor,
  onApply,
}: ColorPickerModalProps) => {
  const labels = useLabels();
  const theme = useRichTheme();
  const t = theme.toolbar;
  const [tab, setTab] = useState<'swatches' | 'spectrum'>('swatches');
  const [hexColor, setHexColor] = useState(initialColor || '#000000');
  const [rgb, setRgb] = useState({ r: 0, g: 0, b: 0 });
  const [hsv, setHsv] = useState({ h: 0, s: 1, v: 1 });
  const [history, setHistory] = useState<string[]>(DEFAULT_HISTORY);
  const [isSliderActive, setIsSliderActive] = useState(false);

  // Seed value only avoids a first-frame thumb jump before onLayout measures the bar.
  const [sliderWidth, setSliderWidth] = useState(CONTENT_WIDTH - 60);

  useEffect(() => {
    if (isOpen) {
      loadHistory();
      updateFromHex(initialColor || '#000000');
    }
  }, [isOpen, initialColor]);

  const loadHistory = async () => {
    try {
      const stored = await AsyncStorage.getItem(HISTORY_KEY);
      if (!stored) return;
      // Storage is device-writable and may hold an older/corrupted value; an
      // unchecked parse reaches render as a non-array and crashes it.
      const parsed: unknown = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.every(c => typeof c === 'string')) {
        setHistory(parsed);
      }
    } catch {
      // ignore — keep the default history
    }
  };

  const saveHistory = async (newColor: string) => {
    try {
      const newHistory = [newColor, ...history.filter(c => !isSameColor(c, newColor))].slice(
        0,
        HISTORY_SLOTS,
      );
      while (newHistory.length < HISTORY_SLOTS) newHistory.push(DEFAULT_HISTORY[0]);
      setHistory(newHistory);
      await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
    } catch {
      // ignore — failing to persist history does not affect functionality
    }
  };

  const updateFromHex = (hex: string) => {
    const r = hexToRgb(hex);
    setRgb(r);
    setHsv(rgbToHsv(r.r, r.g, r.b));
    setHexColor(rgbToHex(r.r, r.g, r.b));
  };

  const updateFromHsv = (h: number, s: number, v: number) => {
    setHsv({ h, s, v });
    const r = hsvToRgb(h, s, v);
    setRgb(r);
    setHexColor(rgbToHex(r.r, r.g, r.b));
  };

  const handleDone = () => {
    saveHistory(hexColor);
    onApply(hexColor);
    onClose();
  };

  const onSpectrumGesture = ({ x, y }: { x: number; y: number }) => {
    // Subtract the virtual padding to get the true color-core coordinates.
    const cx = Math.max(0, Math.min(SPECTRUM_WIDTH, x - SPECTRUM_PAD));
    const cy = Math.max(0, Math.min(SPECTRUM_HEIGHT, y - SPECTRUM_PAD));
    const h = cx / SPECTRUM_WIDTH;
    const s = cy / SPECTRUM_HEIGHT;
    // v=0 renders every hue as black, so a hue tap would otherwise look like a no-op.
    const newV = hsv.v === 0 ? 1 : hsv.v;
    updateFromHsv(h, s, newV);
  };

  const onSliderGesture = ({ x }: { x: number }) => {
    const cx = Math.max(
      SLIDER_TOUCH_PAD + SLIDER_THUMB_RADIUS,
      Math.min(x, sliderWidth + SLIDER_THUMB_RADIUS),
    );
    const v =
      (cx - (SLIDER_TOUCH_PAD + SLIDER_THUMB_RADIUS)) / (sliderWidth - 2 * SLIDER_THUMB_RADIUS);
    updateFromHsv(hsv.h, hsv.s, v);
  };

  const renderSwatches = () => (
    <View style={[styles.swatchesContainer, { borderColor: t.divider }]}>
      {SWATCHES.map((color, index) => {
        const isSelected = isSameColor(hexColor, color);
        return (
          <RichPressable
            key={index}
            noFeedback
            accessibilityRole="button"
            accessibilityLabel={color}
            accessibilityState={{ selected: isSelected }}
            style={[
              styles.swatchItem,
              { backgroundColor: color },
              isSelected && styles.swatchSelected,
            ]}
            onPress={() => updateFromHex(color)}
          >
            <View pointerEvents="none" style={[styles.swatchBleed, { backgroundColor: color }]} />
            {isSelected && <View pointerEvents="none" style={styles.swatchRing} />}
          </RichPressable>
        );
      })}
    </View>
  );

  const renderSpectrum = () => {
    const maxBrightnessRgb = hsvToRgb(hsv.h, hsv.s, 1);
    const maxBrightnessHex = rgbToHex(maxBrightnessRgb.r, maxBrightnessRgb.g, maxBrightnessRgb.b);

    // One Pan per surface also covers taps: onBegin fires on touch-down with local
    // coordinates. runOnJS(true) is mandatory — these callbacks set React state.
    const spectrumPan = Gesture.Pan()
      .runOnJS(true)
      .onBegin(e => onSpectrumGesture(e))
      .onUpdate(e => onSpectrumGesture(e));

    const sliderPan = Gesture.Pan()
      .runOnJS(true)
      .onBegin(e => onSliderGesture(e))
      .onUpdate(e => {
        // Halo only while actively dragging, not for a bare tap.
        setIsSliderActive(true);
        onSliderGesture(e);
      })
      .onFinalize(() => setIsSliderActive(false));

    return (
      <GestureHandlerRootView style={styles.spectrumTab}>
        <GestureDetector gesture={spectrumPan}>
          <View style={styles.spectrumWrapper}>
            <View style={[styles.spectrumBox, { borderColor: t.divider }]}>
              <LinearGradient
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                colors={[
                  '#ff0000',
                  '#ffff00',
                  '#00ff00',
                  '#00ffff',
                  '#0000ff',
                  '#ff00ff',
                  '#ff0000',
                ]}
                style={[StyleSheet.absoluteFill, { borderRadius: 8 }]}
              />
              <LinearGradient
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                colors={['#ffffff', 'rgba(255,255,255,0)']}
                style={[StyleSheet.absoluteFill, { borderRadius: 8 }]}
              />
            </View>
            <View
              style={[
                styles.pickerRing,
                { left: hsv.h * SPECTRUM_WIDTH, top: hsv.s * SPECTRUM_HEIGHT },
              ]}
              pointerEvents="none"
            />
          </View>
        </GestureDetector>

        <View style={styles.sliderContainer}>
          <GestureDetector gesture={sliderPan}>
            <View style={styles.sliderWrapper}>
              <View
                style={[styles.sliderBox, { borderColor: t.divider }]}
                onLayout={e => setSliderWidth(e.nativeEvent.layout.width)}
              >
                <LinearGradient
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  colors={['#000000', maxBrightnessHex]}
                  style={[StyleSheet.absoluteFill, { borderRadius: 8 }]}
                />
              </View>
              {isSliderActive && (
                <View
                  style={[
                    styles.sliderThumbHalo,
                    {
                      left: SLIDER_THUMB_RADIUS + hsv.v * (sliderWidth - 2 * SLIDER_THUMB_RADIUS),
                    },
                  ]}
                />
              )}
              <View
                style={[
                  styles.sliderThumb,
                  { left: SLIDER_TOUCH_PAD + hsv.v * (sliderWidth - 2 * SLIDER_THUMB_RADIUS) },
                ]}
                pointerEvents="none"
              />
            </View>
          </GestureDetector>
          <Text style={[styles.sliderValueText, { color: t.text }]}>
            {Math.round(hsv.v * 100)} %
          </Text>
        </View>
      </GestureHandlerRootView>
    );
  };

  return (
    <Modal
      visible={isOpen}
      transparent
      statusBarTranslucent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.modalContent,
            { backgroundColor: t.surface, boxShadow: `0px 4px 24px ${t.shadowColor}` },
          ]}
        >
          <View style={[styles.tabBar, { backgroundColor: t.itemActiveBackground }]}>
            <RichPressable
              style={[
                styles.tabButton,
                tab === 'swatches' && [styles.tabActive, { backgroundColor: t.surface }],
              ]}
              onPress={() => setTab('swatches')}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: t.textMuted },
                  tab === 'swatches' && { color: t.text, fontWeight: '600' },
                ]}
              >
                {labels.colorSwatchesTab}
              </Text>
            </RichPressable>
            <RichPressable
              style={[
                styles.tabButton,
                tab === 'spectrum' && [styles.tabActive, { backgroundColor: t.surface }],
              ]}
              onPress={() => setTab('spectrum')}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: t.textMuted },
                  tab === 'spectrum' && { color: t.text, fontWeight: '600' },
                ]}
              >
                {labels.colorSpectrumTab}
              </Text>
            </RichPressable>
          </View>

          <View style={styles.mainArea}>
            {tab === 'swatches' ? renderSwatches() : renderSpectrum()}
          </View>

          <View style={styles.infoArea}>
            <View style={styles.infoRow}>
              <View style={[styles.previewBox, { borderColor: t.divider }]}>
                <View
                  style={[styles.previewHalf, { backgroundColor: initialColor || '#000000' }]}
                />
                <View style={[styles.previewHalf, { backgroundColor: hexColor }]} />
              </View>

              <View style={styles.valuesContainer}>
                <View style={styles.valueCol}>
                  <Text style={[styles.valueLabel, { color: t.textMuted }]}>
                    {labels.colorHexLabel}
                  </Text>
                  <Text style={[styles.valueText, { color: t.text }]}>{hexColor}</Text>
                </View>
                <View style={styles.valueCol}>
                  <Text style={[styles.valueLabel, { color: t.textMuted }]}>
                    {labels.colorRedLabel}
                  </Text>
                  <Text style={[styles.valueText, { color: t.text }]}>{rgb.r}</Text>
                </View>
                <View style={styles.valueCol}>
                  <Text style={[styles.valueLabel, { color: t.textMuted }]}>
                    {labels.colorGreenLabel}
                  </Text>
                  <Text style={[styles.valueText, { color: t.text }]}>{rgb.g}</Text>
                </View>
                <View style={styles.valueCol}>
                  <Text style={[styles.valueLabel, { color: t.textMuted }]}>
                    {labels.colorBlueLabel}
                  </Text>
                  <Text style={[styles.valueText, { color: t.text }]}>{rgb.b}</Text>
                </View>
              </View>
            </View>

            <View style={[styles.divider, { borderColor: t.divider }]} />

            <View style={styles.historyRow}>
              {history.map((color, idx) => (
                // noFeedback: dimming a chip shows a color the user did not pick. The tap
                // is answered by the preview box and hex/RGB row updating above.
                <RichPressable
                  key={`hist_${idx}`}
                  noFeedback
                  accessibilityRole="button"
                  accessibilityLabel={color}
                  style={[styles.historyCircle, { backgroundColor: color, borderColor: t.border }]}
                  onPress={() => updateFromHex(color)}
                />
              ))}
            </View>

            <View style={styles.buttonRow}>
              <RichPressable style={styles.actionButton} onPress={onClose}>
                <Text style={[styles.buttonText, { color: t.text }]}>{labels.colorCancel}</Text>
              </RichPressable>
              <View style={[styles.buttonDivider, { backgroundColor: t.divider }]} />
              <RichPressable style={styles.actionButton} onPress={handleDone}>
                <Text style={[styles.buttonText, { color: t.accent }]}>{labels.colorApply}</Text>
              </RichPressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// Layout-only: themed colors are applied inline from `t`. The hardcodes left here
// are theme-independent — scrim, shadows, white glyphs over arbitrary color.
const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: MODAL_WIDTH,
    borderRadius: 16,
    padding: MODAL_PADDING,
  },
  tabBar: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 4,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  tabActive: {
    boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.05)',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
  },
  mainArea: {
    height: 250,
    justifyContent: 'center',
    alignItems: 'center',
  },
  swatchesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    width: '100%',
    height: '100%',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  swatchItem: {
    width: `${100 / SWATCH_COLUMNS}%`,
    height: SWATCH_CELL_HEIGHT,
  },
  // Paints each cell 1 physical pixel past its bounds so neighbours overlap: cell
  // edges land on fractional device pixels and Android can round them apart.
  swatchBleed: {
    position: 'absolute',
    top: -StyleSheet.hairlineWidth,
    left: -StyleSheet.hairlineWidth,
    right: -StyleSheet.hairlineWidth,
    bottom: -StyleSheet.hairlineWidth,
  },
  swatchSelected: {
    // zIndex, not the shadow, holds the cell above its neighbours' bleed:
    // boxShadow paints only, it does not reorder siblings.
    zIndex: 10,
    boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.3)',
  },
  // Selection ring as an overlay child, not a border: a parent border is painted over
  // by the neighbours' bleed.
  swatchRing: {
    ...StyleSheet.absoluteFill,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  spectrumTab: {
    width: '100%',
    alignItems: 'center',
  },
  spectrumWrapper: {
    width: SPECTRUM_WIDTH + SPECTRUM_PAD * 2,
    height: SPECTRUM_HEIGHT + SPECTRUM_PAD * 2,
    marginHorizontal: -SPECTRUM_PAD,
    marginTop: -SPECTRUM_PAD,
    marginBottom: 6 - SPECTRUM_PAD,
    padding: SPECTRUM_PAD,
    position: 'relative',
    overflow: 'visible',
  },
  spectrumBox: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pickerRing: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: 'transparent',
    boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.28), 0px 0px 1px rgba(0, 0, 0, 0.20)',
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    width: '100%',
  },
  sliderWrapper: {
    flex: 1,
    paddingHorizontal: SLIDER_TOUCH_PAD,
    paddingVertical: SLIDER_TOUCH_PAD,
    marginHorizontal: -SLIDER_TOUCH_PAD,
    marginVertical: -SLIDER_TOUCH_PAD,
    position: 'relative',
  },
  sliderBox: {
    width: '100%',
    height: 16,
    borderRadius: 8,
    position: 'relative',
    borderWidth: StyleSheet.hairlineWidth,
  },
  sliderThumbHalo: {
    position: 'absolute',
    top: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.1)',
  },
  sliderThumb: {
    position: 'absolute',
    top: 15,
    width: SLIDER_THUMB_RADIUS * 2,
    height: SLIDER_THUMB_RADIUS * 2,
    borderRadius: SLIDER_THUMB_RADIUS,
    backgroundColor: '#FFFFFF',
    boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.2)',
  },
  sliderValueText: {
    fontSize: 14,
    marginLeft: 4,
    width: 44,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  infoArea: {
    marginTop: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  previewBox: {
    width: 48,
    height: 36,
    borderRadius: 6,
    flexDirection: 'row',
    borderWidth: 1,
    overflow: 'hidden',
    marginRight: 16,
  },
  previewHalf: {
    flex: 1,
  },
  valuesContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingRight: 8,
  },
  valueCol: {
    alignItems: 'center',
  },
  valueLabel: {
    fontSize: 12,
    marginBottom: 4,
    fontWeight: '600',
  },
  valueText: {
    fontSize: 14,
  },
  divider: {
    height: 1,
    width: '100%',
    borderTopWidth: 1,
    borderStyle: 'dashed',
    marginBottom: 16,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  historyCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDivider: {
    width: 1,
    height: 20,
  },
});
