/** Inline SVG glyphs for the WebView overlays. */

const iconProps = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/** Table popover button styles + `.table-popover-icon` glyphs; injected by TableHandles. */
export const tablePopoverCss = `
        .table-popover-button {
          background-color: transparent !important;
          border: none !important;
          padding: 12px 14px !important;
          text-align: left !important;
          font-size: 16px !important;
          font-weight: 500 !important;
          color: var(--editor-text-color) !important;
          cursor: pointer !important;
          border-radius: 8px !important;
          display: flex !important;
          align-items: center !important;
          gap: 10px !important;
          width: 100% !important;
          transition: background-color 0.1s, transform 0.1s !important;
          -webkit-tap-highlight-color: transparent !important;
          outline: none !important;
        }
        .table-popover-button:active {
          background-color: var(--editor-divider) !important;
          transform: scale(0.96) !important;
        }
        .table-popover-button.danger {
          color: var(--editor-danger) !important;
        }
        .table-popover-icon {
          color: var(--editor-muted) !important;
        }
        .table-popover-button.danger .table-popover-icon {
          color: var(--editor-danger) !important;
        }
      `;

export const InsertRowAboveIcon = () => (
  <svg className="table-popover-icon" {...iconProps}>
    <path d="M12 11v10" />
    <path d="M16 15l-4-4-4 4" />
    <rect x="3" y="3" width="18" height="4" rx="1" />
  </svg>
);

export const InsertRowBelowIcon = () => (
  <svg className="table-popover-icon" {...iconProps}>
    <path d="M12 13V3" />
    <path d="M16 9l-4 4-4-4" />
    <rect x="3" y="17" width="18" height="4" rx="1" />
  </svg>
);

export const InsertColLeftIcon = () => (
  <svg className="table-popover-icon" {...iconProps}>
    <path d="M11 12h10" />
    <path d="M15 8l-4 4 4 4" />
    <rect x="3" y="3" width="4" height="18" rx="1" />
  </svg>
);

export const InsertColRightIcon = () => (
  <svg className="table-popover-icon" {...iconProps}>
    <path d="M13 12H3" />
    <path d="M9 8l4 4-4 4" />
    <rect x="17" y="3" width="4" height="18" rx="1" />
  </svg>
);

export const TextCursorIcon = () => (
  <svg className="table-popover-icon" {...iconProps}>
    <polyline points="4 7 4 4 20 4 20 7"></polyline>
    <line x1="9" y1="20" x2="15" y2="20"></line>
    <line x1="12" y1="4" x2="12" y2="20"></line>
  </svg>
);

/** Trash with inner lines — table-popover variant of ImageTrashIcon. */
export const TableTrashIcon = () => (
  <svg className="table-popover-icon" {...iconProps}>
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    <line x1="10" y1="11" x2="10" y2="17"></line>
    <line x1="14" y1="11" x2="14" y2="17"></line>
  </svg>
);

export const AlignLeftIcon = () => (
  <svg {...iconProps}>
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="13" y2="12" />
    <line x1="3" y1="18" x2="17" y2="18" />
  </svg>
);

export const AlignCenterIcon = () => (
  <svg {...iconProps}>
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="7" y1="12" x2="17" y2="12" />
    <line x1="5" y1="18" x2="19" y2="18" />
  </svg>
);

export const AlignRightIcon = () => (
  <svg {...iconProps}>
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="11" y1="12" x2="21" y2="12" />
    <line x1="7" y1="18" x2="21" y2="18" />
  </svg>
);

export const CaptionIcon = () => (
  <svg {...iconProps}>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <line x1="7" y1="20" x2="17" y2="20" />
  </svg>
);

/** Simple trash (no inner lines) — image-toolbar variant of TableTrashIcon. */
export const ImageTrashIcon = () => (
  <svg {...iconProps}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

export const ReturnIcon = () => (
  <svg {...iconProps} width={13} height={13} strokeWidth={2.5}>
    <polyline points="9 10 4 15 9 20" />
    <path d="M20 4v7a4 4 0 0 1-4 4H4" />
  </svg>
);
