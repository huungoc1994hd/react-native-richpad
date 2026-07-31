/**
 * Mobile WebKit/Chromium synthesize a ghost mousedown → mouseup → click ~300ms
 * after touchend, even when the touch called preventDefault — React registers its
 * root touchstart listener as PASSIVE, so preventDefault in onTouchStart is a
 * no-op. Untreated, overlay controls double-fire or the ghost lands on the editor
 * and steals the selection.
 *
 * Shared by ALL overlay components so a touch on one suppresses the ghost aimed
 * at another, which may arrive at stale coordinates after the control moved.
 */

import type * as React from 'react';

let lastTouchTapTs = 0;

/** Record that a real touch tap just happened (call from onTouchStart). */
export const markTouchTap = () => {
  lastTouchTapTs = Date.now();
};

/** True while a mouse event is likely the ghost of a recent touch. */
export const isRecentTouchTap = (windowMs = 700): boolean => Date.now() - lastTouchTapTs < windowMs;

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
 * Ghost-safe tap props for an overlay control: the touch arms the guard, the
 * ghost mousedown that follows is dropped. Set `stopPropagation` on controls
 * whose trailing touchend/mouseup/click must not reach the editor underneath.
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
