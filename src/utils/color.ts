/** Color conversion utilities (HSV/RGB/HEX) for the color picker. */

export function hsvToRgb(h: number, s: number, v: number) {
  let r: number = 0,
    g: number = 0,
    b: number = 0;
  let i = Math.floor(h * 6);
  let f = h * 6 - i;
  let p = v * (1 - s);
  let q = v * (1 - f * s);
  let t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0:
      r = v;
      g = t;
      b = p;
      break;
    case 1:
      r = q;
      g = v;
      b = p;
      break;
    case 2:
      r = p;
      g = v;
      b = t;
      break;
    case 3:
      r = p;
      g = q;
      b = v;
      break;
    case 4:
      r = t;
      g = p;
      b = v;
      break;
    case 5:
      r = v;
      g = p;
      b = q;
      break;
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

export function rgbToHex(r: number, g: number, b: number) {
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase();
}

/**
 * Compare two color strings for equality. Case-insensitive on BOTH sides: palette
 * entries are uppercase while editor state carries whatever the document used.
 */
export const isSameColor = (a: string | undefined, b: string | undefined): boolean =>
  !!a && !!b && a.trim().toUpperCase() === b.trim().toUpperCase();

const NAMED_COLORS: Record<string, { r: number; g: number; b: number }> = {
  black: { r: 0, g: 0, b: 0 },
  white: { r: 255, g: 255, b: 255 },
  red: { r: 255, g: 0, b: 0 },
  green: { r: 0, g: 128, b: 0 },
  blue: { r: 0, g: 0, b: 255 },
  yellow: { r: 255, g: 255, b: 0 },
  cyan: { r: 0, g: 255, b: 255 },
  magenta: { r: 255, g: 0, b: 255 },
  orange: { r: 255, g: 165, b: 0 },
  purple: { r: 128, g: 0, b: 128 },
  pink: { r: 255, g: 192, b: 203 },
  gray: { r: 128, g: 128, b: 128 },
  transparent: { r: 0, g: 0, b: 0 },
};

const clampChannel = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

export function hexToRgb(colorStr: string) {
  if (!colorStr) return { r: 0, g: 0, b: 0 };
  let str = colorStr.trim().toLowerCase();

  if (NAMED_COLORS[str]) return NAMED_COLORS[str];

  if (str.startsWith('rgb')) {
    // The percentage form is reachable: values arrive from style attributes on
    // imported HTML/markdown, not only from our own picker.
    const parts = str.match(/-?[\d.]+%?/g);
    if (parts && parts.length >= 3) {
      const channel = (part: string) =>
        // (n * 255) / 100, not n * 2.55: 2.55 rounds 50% down to 127.
        clampChannel(part.endsWith('%') ? (parseFloat(part) * 255) / 100 : parseFloat(part));
      return { r: channel(parts[0]), g: channel(parts[1]), b: channel(parts[2]) };
    }
  }

  let c = str.replace('#', '');
  if (c.length === 3)
    c = c
      .split('')
      .map(x => x + x)
      .join('');
  // #RRGGBBAA: no alpha channel here — drop the pair rather than fall back to black.
  if (c.length === 8) c = c.slice(0, 6);
  let result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(c);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 0, g: 0, b: 0 };
}

export function rgbToHsv(r: number, g: number, b: number) {
  r /= 255;
  g /= 255;
  b /= 255;
  let max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h: number = 0,
    s: number,
    v = max;
  let d = max - min;
  s = max === 0 ? 0 : d / max;
  if (max === min) {
    h = 0; // achromatic
  } else {
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return { h, s, v };
}

/** Material Design palette: 12 columns (hues) x 10 rows (shades). */
const MATERIAL_PALETTES = [
  // Col 0: Grays
  [
    '#FFFFFF',
    '#F5F5F5',
    '#E0E0E0',
    '#BDBDBD',
    '#9E9E9E',
    '#757575',
    '#616161',
    '#424242',
    '#212121',
    '#000000',
  ],
  // Col 1: Red
  [
    '#FFEBEE',
    '#FFCDD2',
    '#EF9A9A',
    '#E57373',
    '#EF5350',
    '#F44336',
    '#E53935',
    '#D32F2F',
    '#C62828',
    '#B71C1C',
  ],
  // Col 2: Deep Orange
  [
    '#FBE9E7',
    '#FFCCBC',
    '#FFAB91',
    '#FF8A65',
    '#FF7043',
    '#FF5722',
    '#F4511E',
    '#E64A19',
    '#D84315',
    '#BF360C',
  ],
  // Col 3: Amber / Yellow
  [
    '#FFF8E1',
    '#FFECB3',
    '#FFE082',
    '#FFD54F',
    '#FFCA28',
    '#FFC107',
    '#FFB300',
    '#FFA000',
    '#FF8F00',
    '#FF6F00',
  ],
  // Col 4: Lime
  [
    '#F9FBE7',
    '#F0F4C3',
    '#E6EE9C',
    '#DCE775',
    '#D4E157',
    '#CDDC39',
    '#C0CA33',
    '#AFB42B',
    '#9E9D24',
    '#827717',
  ],
  // Col 5: Green
  [
    '#E8F5E9',
    '#C8E6C9',
    '#A5D6A7',
    '#81C784',
    '#66BB6A',
    '#4CAF50',
    '#43A047',
    '#388E3C',
    '#2E7D32',
    '#1B5E20',
  ],
  // Col 6: Teal
  [
    '#E0F2F1',
    '#B2DFDB',
    '#80CBC4',
    '#4DB6AC',
    '#26A69A',
    '#009688',
    '#00897B',
    '#00796B',
    '#00695C',
    '#004D40',
  ],
  // Col 7: Cyan / Light Blue
  [
    '#E1F5FE',
    '#B3E5FC',
    '#81D4FA',
    '#4FC3F7',
    '#29B6F6',
    '#03A9F4',
    '#039BE5',
    '#0288D1',
    '#0277BD',
    '#01579B',
  ],
  // Col 8: Blue
  [
    '#E3F2FD',
    '#BBDEFB',
    '#90CAF9',
    '#64B5F6',
    '#42A5F5',
    '#2196F3',
    '#1E88E5',
    '#1976D2',
    '#1565C0',
    '#0D47A1',
  ],
  // Col 9: Indigo
  [
    '#E8EAF6',
    '#C5CAE9',
    '#9FA8DA',
    '#7986CB',
    '#5C6BC0',
    '#3F51B5',
    '#3949AB',
    '#303F9F',
    '#283593',
    '#1A237E',
  ],
  // Col 10: Purple
  [
    '#F3E5F5',
    '#E1BEE7',
    '#CE93D8',
    '#BA68C8',
    '#AB47BC',
    '#9C27B0',
    '#8E24AA',
    '#7B1FA2',
    '#6A1B9A',
    '#4A148C',
  ],
  // Col 11: Pink
  [
    '#FCE4EC',
    '#F8BBD0',
    '#F48FB1',
    '#F06292',
    '#EC407A',
    '#E91E63',
    '#D81B60',
    '#C2185B',
    '#AD1457',
    '#880E4F',
  ],
];

/** Swatch-grid shape. The picker layout must derive its cell size from these. */
export const SWATCH_COLUMNS = MATERIAL_PALETTES.length;
const SWATCH_ROWS = MATERIAL_PALETTES[0].length;

/** Generate the swatch list in row-major order from the Material palette. */
export const generateSwatches = () => {
  const colors: string[] = [];
  for (let r = 0; r < SWATCH_ROWS; r++) {
    for (let c = 0; c < SWATCH_COLUMNS; c++) {
      colors.push(MATERIAL_PALETTES[c][r]);
    }
  }
  return colors;
};
