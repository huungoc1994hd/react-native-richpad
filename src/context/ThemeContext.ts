import { createContext, useContext } from 'react';
import type { RichTheme } from '../theme/types';
import { lightTheme } from '../theme/defaults';

/** Resolved theme for the current RichEditor tree. Defaults to lightTheme. */
export const ThemeContext = createContext<RichTheme>(lightTheme);

export const useRichTheme = (): RichTheme => useContext(ThemeContext);
