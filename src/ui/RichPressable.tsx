import type { ComponentProps, ReactNode } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useRichTheme } from '../context/ThemeContext';

const IS_ANDROID = Platform.OS === 'android';
const PRESSED_OPACITY = 0.6;
const DISABLED_OPACITY = 0.5;

/**
 * Style keys that describe the BOX — where it sits and what shape it is. These go
 * on the clipping wrapper so it occupies exactly the space the caller asked for.
 * Everything else (padding, content alignment) stays on the Pressable, which then
 * fills the wrapper edge to edge so the ripple covers the whole button.
 */
const BOX_KEYS = [
  'borderRadius',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomLeftRadius',
  'borderBottomRightRadius',
  'borderWidth',
  'borderColor',
  'backgroundColor',
  'width',
  'height',
  'minWidth',
  'minHeight',
  'maxWidth',
  'maxHeight',
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'marginHorizontal',
  'marginVertical',
  'marginStart',
  'marginEnd',
  'flex',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'alignSelf',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'zIndex',
  'opacity',
  // On the wrapper, not the child: a shadow on the inner view would be cut away by
  // the clip, while the wrapper draws its shadow outside its own bounds.
  'boxShadow',
] as const satisfies readonly (keyof ViewStyle)[];

type BoxKey = (typeof BOX_KEYS)[number];
type BoxStyle = Pick<ViewStyle, BoxKey>;

// Generic in the key: writing through the whole `BoxKey` union would demand the
// intersection of every value type, which is `never`.
const copyBoxKey = <K extends BoxKey>(from: ViewStyle, to: BoxStyle, key: K) => {
  to[key] = from[key];
};

const splitBoxStyle = (style: StyleProp<ViewStyle>) => {
  const flat = StyleSheet.flatten(style) ?? {};
  const box: BoxStyle = {};
  const inner: ViewStyle = { ...flat };
  for (const key of BOX_KEYS) {
    if (flat[key] !== undefined) {
      copyBoxKey(flat, box, key);
      delete inner[key];
    }
  }
  return { box, inner };
};

export interface RichPressableProps extends Omit<
  ComponentProps<typeof Pressable>,
  'style' | 'children' | 'android_ripple'
> {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Override the themed ripple color. */
  rippleColor?: string;
  /**
   * Suppress ripple AND dim. For a surface whose own appearance is the payload —
   * a color chip, where a ripple reads as a stain and a dim shows a color the user
   * did not pick. Such surfaces answer the tap by other means.
   */
  noFeedback?: boolean;
}

/**
 * The press primitive every tappable surface INSIDE this library goes through, so
 * feedback is uniform and themed without each call site restating it. Internal:
 * consumers compose their own with `ToolbarItem.render`.
 *
 * Android gets the platform ripple; every other platform dims. Never both — a
 * ripple under a dim reads as a double tap.
 *
 * WHY THE ANDROID BRANCH ADDS A WRAPPER VIEW. RN's ripple never follows
 * borderRadius on its own: ReactDrawableHelper builds a bounded ripple's mask as a
 * plain rectangle, and a target's own `overflow: 'hidden'` cannot fix it because
 * ReactViewGroup clips in `dispatchDraw`, which runs BEFORE the view paints its own
 * foreground. A PARENT's clip does work — `clipToPaddingBox` uses `clipPath` with
 * the rounded padding-box path, and children (including their foreground) draw
 * inside it. So the rounded shape has to come from one level up.
 *
 * The ripple must also be a FOREGROUND drawable: the background path
 * (`BackgroundStyleApplicator.setFeedbackUnderlay`) discards its own result when
 * `enableNewBackgroundAndBorderDrawables` is on — the default with Fabric — so the
 * ripple is never installed at all.
 */
export const RichPressable = ({
  children,
  style,
  disabled,
  rippleColor,
  noFeedback = false,
  ...props
}: RichPressableProps) => {
  const theme = useRichTheme();
  const hasRipple = IS_ANDROID && !noFeedback;
  const dimsOnPress = !IS_ANDROID && !noFeedback && !disabled;

  // No ripple to clip → no wrapper, so iOS and the color chips keep a flat tree.
  if (!hasRipple) {
    return (
      <Pressable
        disabled={disabled}
        style={
          dimsOnPress
            ? ({ pressed }) => [style, pressed ? { opacity: PRESSED_OPACITY } : null]
            : [style, disabled ? { opacity: DISABLED_OPACITY } : null]
        }
        {...props}
      >
        {children}
      </Pressable>
    );
  }

  const { box, inner } = splitBoxStyle(style);

  return (
    <View style={[box, styles.clip, disabled ? styles.disabled : null]}>
      <Pressable
        disabled={disabled}
        android_ripple={{
          color: rippleColor ?? theme.toolbar.ripple,
          borderless: false,
          foreground: true,
        }}
        style={[inner, styles.fillBox]}
        {...props}
      >
        {children}
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  clip: {
    overflow: 'hidden',
  },
  disabled: {
    opacity: DISABLED_OPACITY,
  },
  fillBox: {
    flexGrow: 1,
  },
});
