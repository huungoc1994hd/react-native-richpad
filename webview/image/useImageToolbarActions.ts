import React from 'react';
import type { Editor } from '@tiptap/core';
import {
  deleteImageNode,
  insertParagraphAbove,
  insertParagraphBelow,
  hideCaption,
  updateImageAttrs,
  showCaption,
} from '../extensions/imageActions';
import type { ImageAlign } from '../extensions/imageExtended';
import type { ImageSession } from './session';
import type { ActiveImage } from './types';

export type ImageToolbarActions = {
  handleAlign: (align: ImageAlign) => (e: React.SyntheticEvent) => void;
  handleCaption: (e: React.SyntheticEvent) => void;
  handleDelete: (e: React.SyntheticEvent) => void;
  handleInsertAbove: (e: React.SyntheticEvent) => void;
  handleInsertBelow: (e: React.SyntheticEvent) => void;
};

/** Toolbar commands, every one addressed BY NODE POSITION so the image stays selected. */
export const useImageToolbarActions = (
  editor: Editor,
  session: ImageSession,
): ImageToolbarActions => {
  const { activeRef } = session;

  const withActive = (fn: (a: ActiveImage) => void) => (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const a = activeRef.current;
    if (a) fn(a);
  };

  const handleAlign = (align: ImageAlign) =>
    withActive(a => {
      updateImageAttrs(editor, a.targetPos, { align: a.align === align ? null : align });
    });

  /**
   * TOGGLE caption: hidden → show it (restores the saved text, focuses it for
   * typing); shown → hide it (text kept in alt, the image stays active).
   */
  const handleCaption = withActive(a => {
    if (a.hasCaption) {
      hideCaption(editor, a.targetPos);
    } else {
      showCaption(editor, a.imagePos);
    }
  });

  const handleDelete = withActive(a => {
    deleteImageNode(editor, a.targetPos);
  });

  const handleInsertAbove = withActive(a => {
    insertParagraphAbove(editor, a.targetPos);
  });

  const handleInsertBelow = withActive(a => {
    insertParagraphBelow(editor, a.targetPos);
  });

  return { handleAlign, handleCaption, handleDelete, handleInsertAbove, handleInsertBelow };
};
