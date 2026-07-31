import { StyleSheet } from 'react-native';

/**
 * A 24pt icon in 6pt of padding is a 36pt target — under the 44pt/48dp minimum, so
 * every toolbar control extends it vertically. Vertical ONLY: controls sit 0-4pt
 * apart in a row, and horizontal slop would reach into the neighbour's painted box
 * and steal taps aimed at its icon.
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
