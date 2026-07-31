import { createContext, useContext } from 'react';
import type { RichEditorLabels } from '../theme/types';
import { DEFAULT_LABELS } from '../theme/defaults';

/** Resolved toolbar labels for the current RichEditor tree. */
export const LabelsContext = createContext<RichEditorLabels>(DEFAULT_LABELS);

export const useLabels = (): RichEditorLabels => useContext(LabelsContext);
