import { useState, useRef, useEffect, type ReactNode } from 'react';
import {
  Keyboard,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type DimensionValue,
} from 'react-native';
import Animated, { LinearTransition, ZoomIn, ZoomOut } from 'react-native-reanimated';
import { Portal } from '@gorhom/portal';
import { PopoverContext } from './PopoverContext';
import { useRichTheme } from '../../context/ThemeContext';

export const DEFAULT_PORTAL_HOST = 'richpad-portal';

export type PopoverMenuProps = {
  trigger: (props: { onPress: () => void }, isOpen: boolean) => ReactNode;
  children: ReactNode;
  /** Only 'top' | 'bottom' (menu expands above or drops below the trigger). */
  placement?: 'top' | 'bottom';
  onOpen?: () => void;
  onClose?: () => void;
  contentWidth?: DimensionValue;
};

export const PopoverMenu = ({
  trigger,
  children,
  placement = 'bottom',
  onOpen,
  onClose,
  contentWidth = 'auto',
}: PopoverMenuProps) => {
  const theme = useRichTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const triggerRef = useRef<View>(null);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const measureTrigger = (onMeasured?: () => void) => {
    triggerRef.current?.measure((_x, _y, width, height, pageX, pageY) => {
      setCoords({ x: pageX, y: pageY, width, height });
      onMeasured?.();
    });
  };

  // Open only after the measure lands so the menu never flashes at (0, 0).
  const handleOpen = () =>
    measureTrigger(() => {
      setIsOpen(true);
      onOpen?.();
    });

  // The keyboard frame can change while the popover is open (focusing an input
  // inside it swaps the keyboard type/height → the toolbar holding the trigger
  // moves), so re-measure. Keyboard events fire RIGHT at the animation edge, so a
  // single measure catches the old frame; several delays converge on the final one.
  useEffect(() => {
    if (!isOpen) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const remeasureSettled = () => {
      measureTrigger();
      [120, 320, 600, 1000].forEach(delay => {
        timers.push(setTimeout(measureTrigger, delay));
      });
    };
    const events = ['keyboardDidShow', 'keyboardDidHide', 'keyboardDidChangeFrame'] as const;
    const subscriptions = events.map(event => Keyboard.addListener(event, remeasureSettled));
    return () => {
      subscriptions.forEach(subscription => subscription.remove());
      timers.forEach(clearTimeout);
    };
  }, [isOpen]);

  const handleClose = () => {
    setIsOpen(false);
    onClose?.();
  };

  let topPosition: number | undefined = undefined;
  let bottomPosition: number | undefined = undefined;
  let leftPosition: number | undefined = undefined;
  let rightPosition: number | undefined = undefined;

  // Anchor to the nearer screen edge (left half → left, right half → right).
  const isRightAligned = coords.x > screenWidth / 2;

  if (isRightAligned) {
    rightPosition = Math.max(8, screenWidth - (coords.x + coords.width));
  } else {
    leftPosition = Math.max(8, coords.x);
    if (typeof contentWidth === 'number' && leftPosition + contentWidth > screenWidth - 8) {
      leftPosition = screenWidth - contentWidth - 8;
    }
  }

  // ANCHOR ON THE TRIGGER'S VERTICAL CENTER, not its top/bottom edge: buttons in a
  // toolbar row (alignItems center) share a y-center at different heights, so
  // edge-anchoring would push a tall button's popover higher than a short one's.
  // CENTER_GAP 30 = half the standard button height (20) + 10 padding.
  const CENTER_GAP = 30;
  const triggerCenterY = coords.y + coords.height / 2;
  if (placement === 'top') {
    bottomPosition = screenHeight - triggerCenterY + CENTER_GAP;
  } else {
    topPosition = triggerCenterY + CENTER_GAP;
  }

  // The zoom origin so the popover expands out of the button.
  const origin =
    placement === 'top'
      ? isRightAligned
        ? 'bottom right'
        : 'bottom left'
      : isRightAligned
        ? 'top right'
        : 'top left';

  return (
    <>
      <View ref={triggerRef} collapsable={false}>
        {trigger(
          {
            onPress: () => {
              if (isOpen) {
                handleClose();
              } else {
                handleOpen();
              }
            },
          },
          isOpen,
        )}
      </View>

      {isOpen && (
        <Portal hostName={DEFAULT_PORTAL_HOST}>
          <View style={styles.overlay}>
            <Pressable style={styles.backdrop} onPress={handleClose} />

            <View
              style={[
                styles.card,
                {
                  top: topPosition,
                  bottom: bottomPosition,
                  left: leftPosition,
                  right: rightPosition,
                  width: contentWidth === 'auto' ? undefined : contentWidth,
                },
              ]}
            >
              <Animated.View
                entering={ZoomIn.duration(200)}
                exiting={ZoomOut.duration(150)}
                // Slide, don't jump, when the trigger is re-measured (the toolbar
                // moves with the keyboard).
                layout={LinearTransition.duration(180)}
                style={[
                  styles.content,
                  {
                    transformOrigin: origin,
                    backgroundColor: theme.toolbar.surface,
                    boxShadow: `0px 4px 24px ${theme.toolbar.shadowColor}`,
                  },
                ]}
              >
                <PopoverContext.Provider value={{ closePopover: handleClose }}>
                  {children}
                </PopoverContext.Provider>
              </Animated.View>
            </View>
          </View>
        </Portal>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 999,
  },
  backdrop: {
    flex: 1,
  },
  card: {
    position: 'absolute',
    minWidth: 130,
  },
  content: {
    borderRadius: 16,
    padding: 6,
  },
});
