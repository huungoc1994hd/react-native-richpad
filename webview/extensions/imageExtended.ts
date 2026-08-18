import { Extension, type Attributes } from '@tiptap/core';

/** Horizontal placement of an image (figure or bare img). */
export type ImageAlign = 'left' | 'center' | 'right';

/** Validate an align read back off `node.attrs`, which ProseMirror types loosely. */
export const isImageAlign = (value: unknown): value is ImageAlign =>
  value === 'left' || value === 'center' || value === 'right';

/** Build the alignment part of the style using margins (no float — safe for mobile layout). */
export const alignStyle = (align?: ImageAlign | null): string => {
  if (align === 'center') return 'margin-left:auto;margin-right:auto;';
  if (align === 'right') return 'margin-left:auto;';
  if (align === 'left') return 'margin-right:auto;';
  return '';
};

/** Read align back from the inline style (round-trip via getHTML → initialContent). */
const parseAlignFromStyle = (element: HTMLElement): ImageAlign | null => {
  const ml = element.style.marginLeft === 'auto';
  const mr = element.style.marginRight === 'auto';
  if (ml && mr) return 'center';
  if (ml) return 'right';
  if (mr) return 'left';
  return null;
};

/** Read the width back from the inline style, but only when it carries `unit`. */
const parseStyleWidth = (element: HTMLElement, unit: '%' | 'px'): number | null => {
  const w = element.style.width;
  if (w && w.endsWith(unit)) {
    const value = parseFloat(w);
    return Number.isFinite(value) ? value : null;
  }
  return null;
};

/**
 * Width/align attribute spec shared by the `figure` and `image` nodes. `pctAttrName`
 * is where the % width lives: 'width' on a figure, 'pctWidth' on a bare image.
 */
export const imageGeometryAttributes = (pctAttrName: 'width' | 'pctWidth'): Attributes => ({
  [pctAttrName]: {
    default: null,
    parseHTML: (element: HTMLElement) => parseStyleWidth(element, '%'),
    renderHTML: attributes =>
      attributes[pctAttrName] ? { style: `width:${attributes[pctAttrName]}%;` } : {},
  },
  pxWidth: {
    default: null,
    parseHTML: (element: HTMLElement) => parseStyleWidth(element, 'px'),
    renderHTML: attributes =>
      attributes.pxWidth ? { style: `width:${attributes.pxWidth}px;` } : {},
  },
  align: {
    default: null,
    parseHTML: (element: HTMLElement) => parseAlignFromStyle(element),
    renderHTML: attributes => (attributes.align ? { style: alignStyle(attributes.align) } : {}),
  },
});

/**
 * Adds pctWidth/pxWidth/align to TenTapStartKit's EXISTING image node, as inline style.
 * Never named width/height: tiptap renders those as bare HTML attributes.
 */
export const ImageAttrs = Extension.create({
  name: 'imageAttrs',

  addGlobalAttributes() {
    return [
      {
        types: ['image'],
        attributes: imageGeometryAttributes('pctWidth'),
      },
    ];
  },
});
