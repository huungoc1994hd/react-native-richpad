import { BridgeExtension, HistoryBridge } from '@10play/tentap-editor/web';
// Command augmentation for undo/redo (UndoRedo).
import type {} from '@tiptap/extensions';
import { getCaptionOwner } from '../extensions/captionSession';

/**
 * Replaces tentap's HistoryBridge, swapped inside the array (quirk 7): the stock
 * handler's chain().focus() would steal a focused caption's focus.
 */
export const CaptionAwareHistoryBridge = new BridgeExtension<
  { canUndo: boolean; canRedo: boolean },
  Record<string, never>,
  { type: 'undo' | 'redo'; payload?: undefined }
>({
  tiptapExtension: HistoryBridge.tiptapExtension,
  onBridgeMessage: (editor, message) => {
    if (message.type !== 'undo' && message.type !== 'redo') return false;
    const inCaption = !!getCaptionOwner();
    if (message.type === 'undo') {
      if (inCaption) editor.commands.undo();
      else editor.chain().focus().undo().run();
    } else {
      if (inCaption) editor.commands.redo();
      else editor.chain().focus().redo().run();
    }
    return true;
  },
  extendEditorState: editor => ({
    canUndo: editor.can().undo?.() ?? false,
    canRedo: editor.can().redo?.() ?? false,
  }),
});
