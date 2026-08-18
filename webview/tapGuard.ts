/**
 * Mobile engines synthesize a ghost mousedown/click after touchend, and React's passive
 * root listener means onTouchStart cannot cancel it (quirk 3). Shared by ALL overlays.
 */

import type * as React from 'react';

let lastTouchTapTs = 0;

/** Record that a real touch tap just happened (call from onTouchStart). */
const markTouchTap = () => {
  lastTouchTapTs = Date.now();
};

/** True while a mouse event is likely the ghost of a recent touch. */
const isRecentTouchTap = (windowMs = 700): boolean => Date.now() - lastTouchTapTs < windowMs;

/** Swallow the synthesized mouse burst at window capture for `durationMs`. */
export const swallowGhostMouseEvents = (durationMs = 400) => {
  const swallow = (ev: Event) => {
    ev.preventDefault();
    ev.stopPropagation();
  };
  const types = ['mousedown', 'mouseup', 'click'] as const;
  types.forEach(t => window.addEventListener(t, swallow, { capture: true }));
  window.setTimeout(() => {
    types.forEach(t => window.removeEventListener(t, swallow, { capture: true }));
  }, durationMs);
};

type TapHandlerProps = {
  onTouchStart: (e: React.TouchEvent) => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onTouchEnd?: (e: React.TouchEvent) => void;
  onMouseUp?: (e: React.MouseEvent) => void;
  onClick?: (e: React.MouseEvent) => void;
};

/**
 * Ghost-safe tap props for an overlay control. Set `stopPropagation` when the trailing
 * touchend/click must not reach the editor underneath.
 */
export const tapHandlers = (
  handler: (e: React.TouchEvent | React.MouseEvent) => void,
  { stopPropagation = false }: { stopPropagation?: boolean } = {},
): TapHandlerProps => {
  const props: TapHandlerProps = {
    onTouchStart: e => {
      markTouchTap();
      swallowGhostMouseEvents();
      handler(e);
    },
    onMouseDown: e => {
      if (isRecentTouchTap()) return;
      handler(e);
    },
  };
  if (stopPropagation) {
    const stop = (e: React.TouchEvent | React.MouseEvent) => e.stopPropagation();
    props.onTouchEnd = stop;
    props.onMouseUp = stop;
    props.onClick = stop;
  }
  return props;
};
