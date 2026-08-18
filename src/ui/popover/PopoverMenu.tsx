import { useCallback, useState, useRef, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type DimensionValue,
} from 'react-native';
import { useKeyboardHandler } from 'react-native-keyboard-controller';
import Animated, { LinearTransition, ZoomIn, ZoomOut, runOnJS } from 'react-native-reanimated';
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

  const measureTrigger = useCallback((onMeasured?: () => void) => {
    triggerRef.current?.measure((_x, _y, width, height, pageX, pageY) => {
      setCoords({ x: pageX, y: pageY, width, height });
      onMeasured?.();
    });
  }, []);

  // Open only after the measure lands so the menu never flashes at (0, 0).
  const handleOpen = () =>
    measureTrigger(() => {
      setIsOpen(true);
      onOpen?.();
    });

  // The keyboard frame can change while the popover is open, and the toolbar moves
  // with it. Re-measure when the animation ENDS — the first moment it is final.
  const openRef = useRef(isOpen);
  openRef.current = isOpen;
  const remeasureIfOpen = useCallback(() => {
    if (openRef.current) measureTrigger();
  }, [measureTrigger]);

  useKeyboardHandler(
    {
      onEnd: () => {
        'worklet';
        runOnJS(remeasureIfOpen)();
      },
    },
    [remeasureIfOpen],
  );

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
    // Symmetric clamp with the left-aligned branch: a right-anchored popover wider
    // than the space left of its trigger would poke past the LEFT screen edge.
    if (typeof contentWidth === 'number' && rightPosition + contentWidth > screenWidth - 8) {
      rightPosition = Math.max(8, screenWidth - contentWidth - 8);
    }
  } else {
    leftPosition = Math.max(8, coords.x);
    if (typeof contentWidth === 'number' && leftPosition + contentWidth > screenWidth - 8) {
      leftPosition = screenWidth - contentWidth - 8;
    }
  }

  // Anchor on the trigger's vertical CENTRE: toolbar buttons share a y-centre at
  // different heights, so edge-anchoring would misalign their popovers.
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

            <Animated.View
              // Slide, don't jump, when the trigger is re-measured. The position props
              // live on THIS view, so the layout transition must too.
              layout={LinearTransition.duration(180)}
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
            </Animated.View>
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
