import React from 'react';
// Every control taps through tapHandlers: a ghost click steals the NodeSelection and
// makes each button double-fire (quirk 3).
import { tapHandlers } from '../tapGuard';
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  CaptionIcon,
  ImageTrashIcon,
  ReturnIcon,
} from '../icons';
import type { ImageAlign } from '../extensions/imageExtended';
import type { ImageToolbarActions } from './useImageToolbarActions';

/** 40px: a touch area wide enough that an off-center tap still hits the handle, not the image. */
const HANDLE_TOUCH_SIZE = 40;
export const TOOLBAR_OFFSET = 48;
/** The bar's own height; TOOLBAR_OFFSET is this plus the gap to the image. */
export const TOOLBAR_HEIGHT = 40;
/** Half the toolbar's width, used to clamp it inside the container. */
export const TOOLBAR_HALF_WIDTH = 130;

type KeepFocusRef = (node: HTMLElement | null) => void;

export const ImageToolbar = ({
  top,
  centerX,
  align,
  hasCaption,
  actions,
  keepFocusOnTouch,
}: {
  top: number;
  centerX: number;
  align: ImageAlign | null;
  hasCaption: boolean;
  actions: ImageToolbarActions;
  keepFocusOnTouch: KeepFocusRef;
}) => (
  <div
    ref={keepFocusOnTouch}
    contentEditable={false}
    style={{
      position: 'absolute',
      top,
      left: centerX,
      transform: 'translateX(-50%)',
      zIndex: 70,
      display: 'flex',
      alignItems: 'center',
      gap: 2,
      padding: 3,
      backgroundColor: 'var(--editor-surface)',
      borderRadius: 10,
      border: '1px solid rgba(0,0,0,0.06)',
      boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
      whiteSpace: 'nowrap',
    }}
  >
    <ToolbarIconButton active={align === 'left'} onTap={actions.handleAlign('left')}>
      <AlignLeftIcon />
    </ToolbarIconButton>
    <ToolbarIconButton
      active={align === 'center' || align === null}
      onTap={actions.handleAlign('center')}
    >
      <AlignCenterIcon />
    </ToolbarIconButton>
    <ToolbarIconButton active={align === 'right'} onTap={actions.handleAlign('right')}>
      <AlignRightIcon />
    </ToolbarIconButton>
    <ToolbarDivider />
    <ToolbarIconButton active={hasCaption} onTap={actions.handleCaption}>
      <CaptionIcon />
    </ToolbarIconButton>
    <ToolbarDivider />
    <ToolbarIconButton danger onTap={actions.handleDelete}>
      <ImageTrashIcon />
    </ToolbarIconButton>
  </div>
);

/** ⏎ badge — insert an empty line above or below the image. */
export const InsertLineBadge = ({
  top,
  left,
  onTap,
}: {
  top: number;
  left: number;
  onTap: (e: React.SyntheticEvent) => void;
}) => (
  <div
    contentEditable={false}
    {...tapHandlers(onTap)}
    style={{
      position: 'absolute',
      top,
      left,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: 'var(--editor-accent)',
      color: '#ffffff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 73,
      boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
      cursor: 'pointer',
    }}
  >
    <ReturnIcon />
  </div>
);

export const ResizeCorner = ({
  top,
  left,
  deg,
  onStart,
  keepFocusOnTouch,
}: {
  top: number;
  left: number;
  /** Rotation that points the crop hook outwards from its corner. */
  deg: number;
  onStart: (e: React.TouchEvent | React.MouseEvent) => void;
  keepFocusOnTouch: KeepFocusRef;
}) => (
  <div
    ref={keepFocusOnTouch}
    contentEditable={false}
    {...tapHandlers(onStart)}
    style={{
      position: 'absolute',
      top: top - HANDLE_TOUCH_SIZE / 2,
      left: left - HANDLE_TOUCH_SIZE / 2,
      width: HANDLE_TOUCH_SIZE,
      height: HANDLE_TOUCH_SIZE,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 72,
      cursor: 'nwse-resize',
      WebkitTapHighlightColor: 'transparent',
    }}
  >
    {/* Crop-style corner hook (iOS Photos/Canva); the white stroke
        underneath boosts contrast on dark image backgrounds. */}
    <svg
      width={18}
      height={18}
      viewBox="0 0 18 18"
      style={{ transform: `rotate(${deg}deg)`, display: 'block' }}
    >
      <path
        d="M 3 15 L 3 8 Q 3 3 8 3 L 15 3"
        fill="none"
        stroke="#ffffff"
        strokeWidth={5.5}
        strokeLinecap="round"
      />
      <path
        d="M 3 15 L 3 8 Q 3 3 8 3 L 15 3"
        fill="none"
        stroke="var(--editor-accent)"
        strokeWidth={3.5}
        strokeLinecap="round"
      />
    </svg>
  </div>
);

export const DragSizeLabel = ({
  top,
  centerX,
  text,
}: {
  top: number;
  centerX: number;
  text: string;
}) => (
  <div
    style={{
      position: 'absolute',
      top,
      left: centerX,
      transform: 'translateX(-50%)',
      zIndex: 73,
      padding: '3px 10px',
      borderRadius: 12,
      backgroundColor: 'rgba(0,0,0,0.65)',
      color: '#fff',
      fontSize: 12,
      fontWeight: 600,
      pointerEvents: 'none',
    }}
  >
    {text}
  </div>
);

const ToolbarIconButton = ({
  children,
  onTap,
  active = false,
  danger = false,
}: {
  children: React.ReactNode;
  onTap: (e: React.SyntheticEvent) => void;
  active?: boolean;
  danger?: boolean;
}) => (
  <button
    {...tapHandlers(onTap)}
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 36,
      height: 32,
      border: 'none',
      borderRadius: 7,
      backgroundColor: active ? 'var(--editor-accent-soft)' : 'transparent',
      color: danger
        ? 'var(--editor-danger)'
        : active
          ? 'var(--editor-accent)'
          : 'var(--editor-icon)',
      padding: 0,
      WebkitTapHighlightColor: 'transparent',
      cursor: 'pointer',
    }}
  >
    {children}
  </button>
);

const ToolbarDivider = () => (
  <div
    style={{
      width: 1,
      height: 20,
      backgroundColor: 'var(--editor-divider)',
      margin: '0 3px',
    }}
  />
);
