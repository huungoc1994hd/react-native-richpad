import type { RichTheme, RichThemePartial } from './types';
import { darkTheme, lightTheme } from './defaults';

/**
 * Spreading the partial would copy explicitly-`undefined` values, so a conditional
 * override (`accent: isDark ? '#22D3EE' : undefined`) would erase the default.
 */
const mergeDefined = <T extends object>(base: T, partial?: Partial<T>): T => {
  if (!partial) return base;
  const merged = { ...base };
  // Generic in the key so the indexed write needs no assertion.
  const copy = <K extends keyof T>(key: K) => {
    const value = partial[key];
    if (value !== undefined) merged[key] = value;
  };
  (Object.keys(partial) as (keyof T)[]).forEach(copy);
  return merged;
};

/** Merge a partial theme over the light/dark base (chosen by `mode`). */
export const resolveTheme = (partial?: RichThemePartial): RichTheme => {
  const base = partial?.mode === 'dark' ? darkTheme : lightTheme;
  if (!partial) return base;
  return {
    mode: partial.mode ?? base.mode,
    toolbar: mergeDefined(base.toolbar, partial.toolbar),
    editor: mergeDefined(base.editor, partial.editor),
    fontColors: partial.fontColors ?? base.fontColors,
    highlightColors: partial.highlightColors ?? base.highlightColors,
  };
};
