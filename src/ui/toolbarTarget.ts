import { StyleSheet } from 'react-native';

/**
 * A 24pt icon in 6pt padding is under the 44pt minimum target. Vertical ONLY:
 * controls sit 0-4pt apart, and horizontal slop would steal a neighbour's taps.
 */
export const TOOLBAR_HIT_SLOP = { top: 8, bottom: 8 } as const;

/** Painted box shared by every toolbar control, so none of them drift apart. */
export const toolbarTargetStyles = StyleSheet.create({
  target: {
    padding: 6,
    borderRadius: 6,
  },
  /** Icon-plus-caret and icon-plus-label content sits on one line. */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
