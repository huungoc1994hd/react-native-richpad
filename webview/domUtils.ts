/**
 * Compile-time proof that a switch covered its union. Pass `message` for a union, or
 * `message.type` where the bridge carries a single object type.
 */
export const assertUnhandled = (unhandled: never): void => {
  void unhandled;
};

/** tentap's scroll wrapper inside #root. The only place this DOM contract is encoded. */
/**
 * Whether an INPUT SESSION is live: the focused element is an editing host or form
 * control. Answers "in-page handoff or a new session?", which viewport height cannot.
 */
export const isInputSessionLive = (): boolean => {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
};

/** Android WebView (Chromium) vs iOS (WebKit) — several workarounds split on it. */
export const IS_ANDROID = /android/i.test(navigator.userAgent);

export const getScrollContainer = (): HTMLElement | null =>
  document.querySelector('#root > div:nth-of-type(1)');

/**
 * Geometry of the overlays portalled INTO the scroll container: coordinates are
 * relative to the container's content, so they drift with scroll on their own.
 */
export type ContentRect = { top: number; left: number; width: number; height: number };

/** Convert a viewport rect to content coordinates. `cRect` is `container`'s own rect. */
export const toContentRect = (r: DOMRect, container: HTMLElement, cRect: DOMRect): ContentRect => ({
  top: r.top - cRect.top + container.scrollTop,
  left: r.left - cRect.left + container.scrollLeft,
  width: r.width,
  height: r.height,
});
