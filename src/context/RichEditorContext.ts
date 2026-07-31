import { createContext, useContext } from 'react';
import type { RichEditorInstance } from '../hooks/useRichEditor';

/** Shares the editor instance with RichEditor + the toolbars (set by RichEditorProvider). */
export const RichEditorContext = createContext<RichEditorInstance | null>(null);

export const useRichEditorContext = (): RichEditorInstance => {
  const value = useContext(RichEditorContext);
  if (!value) {
    throw new Error('RichEditor components must be rendered inside <RichEditorProvider>.');
  }
  return value;
};
