import { DEFAULT_EDITOR_LABELS, EditorConfig, EditorLabels, EditorMetrics } from '../src/protocol';

let labels: EditorLabels = { ...DEFAULT_EDITOR_LABELS };

/** Exported for the places that need a metric before InitConfig can arrive. */
export const DEFAULT_METRICS: Required<EditorMetrics> = {
  imageMinWidthPct: 15,
  imageMinWidthPx: 48,
  tableMinCellWidth: 70,
};
let metrics: Required<EditorMetrics> = { ...DEFAULT_METRICS };

const listeners = new Set<() => void>();

const setVar = (name: string, value: string | undefined) => {
  if (value) {
    document.documentElement.style.setProperty(name, value);
  }
};

/** Apply an InitConfig payload from RN. */
export const applyEditorConfig = (config: EditorConfig) => {
  if (config.labels) {
    labels = { ...labels, ...config.labels };
  }

  const theme = config.theme;
  if (theme) {
    if (theme.accentColor) {
      document.documentElement.style.setProperty('--editor-accent', theme.accentColor);
      // Alpha variants (6-digit hex only): 10% highlight fill, 45% image-selection outline.
      if (/^#[0-9a-fA-F]{6}$/.test(theme.accentColor)) {
        document.documentElement.style.setProperty(
          '--editor-accent-soft',
          `${theme.accentColor}1A`,
        );
        document.documentElement.style.setProperty(
          '--editor-accent-outline',
          `${theme.accentColor}73`,
        );
      }
    }
    setVar('--editor-font-family', theme.fontFamily);
    setVar('--editor-font-size', theme.fontSize);
    setVar('--editor-background-color', theme.backgroundColor);
    setVar('--editor-text-color', theme.textColor);
    setVar('--editor-placeholder-color', theme.placeholderColor);
    setVar('--editor-table-border-color', theme.tableBorderColor);
    setVar('--editor-table-header-bg', theme.tableHeaderBackground);
    setVar('--editor-caption-color', theme.captionColor);
    setVar('--editor-search-highlight-bg', theme.searchHighlightColor);
    setVar('--editor-search-active-bg', theme.searchActiveHighlightColor);
    setVar('--editor-surface', theme.surfaceColor);
    setVar('--editor-border', theme.borderColor);
    setVar('--editor-icon', theme.iconColor);
    setVar('--editor-muted', theme.mutedColor);
    setVar('--editor-divider', theme.dividerColor);
    setVar('--editor-danger', theme.dangerColor);
  }

  if (config.metrics) {
    // Keyed copy, not a spread: every field is optional, so a spread would write a
    // present-but-undefined key over a resolved one.
    const next = { ...metrics };
    const take = <K extends keyof Required<EditorMetrics>>(key: K) => {
      const value = config.metrics?.[key];
      if (value !== undefined) next[key] = value;
    };
    for (const key of Object.keys(next) as (keyof Required<EditorMetrics>)[]) {
      take(key);
    }
    metrics = next;
    if (config.metrics.tableMinCellWidth != null) {
      document.documentElement.style.setProperty(
        '--editor-table-min-cell-width',
        `${config.metrics.tableMinCellWidth}px`,
      );
    }
  }

  listeners.forEach(listener => listener());
};

export const getEditorLabels = (): EditorLabels => labels;

export const getEditorMetrics = (): Required<EditorMetrics> => metrics;

export const subscribeEditorConfig = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * The one geometry fact the page cannot measure: a native host view over the
 * WebView. See KeyboardWillShowPayload.hostChromeOverlap.
 */
export const hostChromeState = {
  overlap: 0,
};
