import React, { useEffect, useState } from 'react';
import { BridgeMessageType, type EditorLabels } from '../../src/protocol';
import {
  InsertColLeftIcon,
  InsertColRightIcon,
  InsertRowAboveIcon,
  InsertRowBelowIcon,
  TableTrashIcon,
  TextCursorIcon,
} from '../icons';
import { getVisibleBottom } from '../scrollCoordinator';
import {
  HANDLE_DOT_STYLE,
  HANDLE_TOUCH_TARGET_STYLE,
  SELECTION_FADE_MS,
  TABLE_POPOVER_DIVIDER_STYLE,
  type TableAction,
} from './constants';
import type { TablePopoverState } from './types';

/** The three-dot grip inside a row/column handle pill. */
const HandleDots = () => (
  <>
    {[0, 1, 2].map(i => (
      <div key={i} style={HANDLE_DOT_STYLE} />
    ))}
  </>
);

/**
 * Blue row/col/table highlight that fades in and out. The parent drops the rect the
 * instant the popover closes, so the last one is retained for the exit transition.
 */
export const SelectionOverlay = ({ rect }: { rect: React.CSSProperties | null }) => {
  const [shown, setShown] = useState<React.CSSProperties | null>(rect);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (rect) {
      setShown(rect);
      // Double rAF: paint opacity 0 first, so the transition runs on mount.
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }
    setVisible(false);
    const timer = window.setTimeout(() => setShown(null), SELECTION_FADE_MS);
    return () => window.clearTimeout(timer);
  }, [rect]);

  if (!shown) return null;
  return (
    <div
      style={{
        ...shown,
        opacity: visible ? 1 : 0,
        transition: `opacity ${SELECTION_FADE_MS}ms ease`,
      }}
    />
  );
};

type HandleProps = {
  top: number;
  left: number;
  hidden: boolean;
  /** Spread of tapHandlers — a ghost mousedown must not re-run the open. */
  tap: Record<string, unknown>;
  transition?: string;
};

const handleFrame = (
  { top, left, hidden, transition }: HandleProps,
  extra?: React.CSSProperties,
): React.CSSProperties => ({
  ...HANDLE_TOUCH_TARGET_STYLE,
  top,
  left,
  opacity: hidden ? 0 : 1,
  pointerEvents: hidden ? 'none' : 'auto',
  transition: transition ? `opacity 0.1s, ${transition}` : 'opacity 0.1s',
  ...extra,
});

/** Whole-table handle: the small grid box at the table's top-left corner. */
export const TableHandle = ({ active, ...props }: HandleProps & { active: boolean }) => (
  <div className="handle-wrapper" contentEditable={false} style={handleFrame(props)} {...props.tap}>
    <div
      className="handle-icon-box"
      style={{
        width: 14,
        height: 14,
        backgroundColor: active ? 'var(--editor-accent)' : 'var(--editor-surface)',
        border: active ? 'none' : '1px solid var(--editor-border)',
        borderRadius: 4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke={active ? '#FFFFFF' : 'var(--editor-icon)'}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="3" y1="12" x2="21" y2="12"></line>
        <line x1="12" y1="3" x2="12" y2="21"></line>
      </svg>
    </div>
  </div>
);

/** Row or column handle: the dotted pill alongside the table. */
export const PillHandle = ({
  active,
  orientation,
  ...props
}: HandleProps & { active: boolean; orientation: 'row' | 'col' }) => (
  <div className="handle-wrapper" contentEditable={false} style={handleFrame(props)} {...props.tap}>
    <div
      className="handle-pill"
      style={{
        width: orientation === 'row' ? 8 : 18,
        height: orientation === 'row' ? 18 : 8,
        backgroundColor: active ? 'var(--editor-accent)' : 'var(--editor-border)',
        borderRadius: 4,
        display: 'flex',
        flexDirection: orientation === 'row' ? 'column' : 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
      }}
    >
      <HandleDots />
    </div>
  </div>
);

/** Grip on a column's right edge that starts a resize drag. */
export const ColumnResizeGrip = ({
  top,
  left,
  hidden,
  onStart,
}: {
  top: number;
  left: number;
  hidden: boolean;
  onStart: (event: React.TouchEvent | React.MouseEvent) => void;
}) => (
  <div
    className="handle-wrapper"
    contentEditable={false}
    style={handleFrame({ top, left, hidden, tap: {} }, { zIndex: 60, cursor: 'ew-resize' })}
    onTouchStart={onStart}
    onTouchEnd={event => event.stopPropagation()}
    onMouseDown={onStart}
    onMouseUp={event => event.stopPropagation()}
    onClick={event => event.stopPropagation()}
  >
    <div
      className="handle-icon-box"
      style={{
        width: 20,
        height: 10,
        backgroundColor: 'var(--editor-surface)',
        border: '1px solid var(--editor-border)',
        borderRadius: 5,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
      }}
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--editor-muted)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="8 17 2 12 8 7"></polyline>
        <polyline points="16 17 22 12 16 7"></polyline>
      </svg>
    </div>
  </div>
);

/** Estimated menu heights, used to decide whether it fits below the handle. */
const POPOVER_HEIGHT = { table: 230, row: 175, col: 175 };

const MenuButton = ({
  icon,
  label,
  danger,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  onPress: () => void;
}) => (
  <button
    className={danger ? 'table-popover-button danger' : 'table-popover-button'}
    onClick={onPress}
  >
    {icon} {label}
  </button>
);

const Divider = () => <div style={TABLE_POPOVER_DIVIDER_STYLE} />;

/**
 * The row/column/table action menu. Every control preventDefaults mousedown (the
 * tiptap toolbar contract), so focus never leaves the editable and the keyboard stays.
 */
export const TablePopover = ({
  popover,
  labels,
  onAction,
  onDismiss,
}: {
  popover: TablePopoverState;
  labels: EditorLabels;
  onAction: (action: TableAction) => void;
  onDismiss: () => void;
}) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // Double rAF: paint the collapsed state first, so the transition runs.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setMounted(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);

  const isRightAligned = popover.x > window.innerWidth - 200;
  // No room below → FLIP upward, hugging the handle. Clamping the top instead would
  // detach the menu from its anchor.
  const height = POPOVER_HEIGHT[popover.type];
  // getVisibleBottom, not innerHeight: the host does not always resize the WebView
  // for the keyboard.
  const fitsBelow = popover.y + height <= getVisibleBottom();
  const anchorY = popover.y - 10; // popover.y = tap point + 10
  const flippedBottom = Math.min(
    window.innerHeight - anchorY + 8,
    window.innerHeight - 15 - height,
  );

  return (
    <>
      <div
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 90 }}
        onMouseDown={event => event.preventDefault()}
        onClick={onDismiss}
      />
      <div
        onMouseDown={event => event.preventDefault()}
        style={{
          position: 'fixed',
          ...(fitsBelow ? { top: popover.y } : { bottom: flippedBottom }),
          ...(isRightAligned ? { right: 15 } : { left: Math.max(15, popover.x) }),
          backgroundColor: 'var(--editor-surface)',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          borderRadius: 14,
          border: '1px solid rgba(0,0,0,0.05)',
          padding: 6,
          display: 'flex',
          flexDirection: 'column',
          zIndex: 100,
          minWidth: 180,
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'scale(1)' : 'scale(0.85)',
          transformOrigin: `${fitsBelow ? 'top' : 'bottom'} ${isRightAligned ? 'right' : 'left'}`,
          transition: 'opacity 0.35s ease-out, transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        {popover.type === 'row' && (
          <>
            <MenuButton
              icon={<InsertRowAboveIcon />}
              label={labels.addRowAbove}
              onPress={() => onAction('addRowBefore')}
            />
            <Divider />
            <MenuButton
              icon={<InsertRowBelowIcon />}
              label={labels.addRowBelow}
              onPress={() => onAction('addRowAfter')}
            />
            <Divider />
            <MenuButton
              icon={<TableTrashIcon />}
              label={labels.deleteRow}
              danger
              onPress={() => onAction('deleteRow')}
            />
          </>
        )}
        {popover.type === 'col' && (
          <>
            <MenuButton
              icon={<InsertColLeftIcon />}
              label={labels.addColumnLeft}
              onPress={() => onAction('addColumnBefore')}
            />
            <Divider />
            <MenuButton
              icon={<InsertColRightIcon />}
              label={labels.addColumnRight}
              onPress={() => onAction('addColumnAfter')}
            />
            <Divider />
            <MenuButton
              icon={<TableTrashIcon />}
              label={labels.deleteColumn}
              danger
              onPress={() => onAction('deleteColumn')}
            />
          </>
        )}
        {popover.type === 'table' && (
          <>
            <MenuButton
              icon={<TextCursorIcon />}
              label={labels.insertParagraphAbove}
              onPress={() => onAction(BridgeMessageType.InsertParagraphBeforeTable)}
            />
            <Divider />
            <MenuButton
              icon={<InsertRowBelowIcon />}
              label={labels.addRow}
              onPress={() => onAction('appendRow')}
            />
            <Divider />
            <MenuButton
              icon={<InsertColRightIcon />}
              label={labels.addColumn}
              onPress={() => onAction('appendColumn')}
            />
            <Divider />
            <MenuButton
              icon={<TableTrashIcon />}
              label={labels.deleteTable}
              danger
              onPress={() => onAction('deleteTable')}
            />
          </>
        )}
      </div>
    </>
  );
};
