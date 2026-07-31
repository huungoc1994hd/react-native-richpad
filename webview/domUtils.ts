/** DOM contracts for the WebView overlays, plus the shared exhaustiveness assertion. */

/**
 * Compile-time proof that a switch covered its union: the argument only type-checks
 * while every member is handled, so a new one is an error at the call site.
 *
 * Pass `message` for a union; pass `message.type` where the bridge carries a single
 * object type, which never narrows to `never` on its own.
 */
export const assertUnhandled = (unhandled: never): void => {
  void unhandled;
};

/** tentap's scroll wrapper inside #root. The only place this DOM contract is encoded. */
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
