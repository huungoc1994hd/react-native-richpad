import { BridgeExtension } from '@10play/tentap-editor/web';
import { BridgeMessageType, MediaBridgeMessage } from '../../src/protocol';
import { assertUnhandled } from '../domUtils';
import { leaveImageSession } from '../extensions/imageActions';
import { findTextSelectionNear } from '../extensions/pmSelection';
import { takeInsertPos } from './insertPosition';

/** Media-insert bridge — inserts at the saved cursor position (see savedInsertPos). */
export const MediaBridge = new BridgeExtension<
  Record<string, never>,
  Record<string, never>,
  MediaBridgeMessage
>({
  forceName: 'media',
  onBridgeMessage: (editor, message) => {
    switch (message.type) {
      case BridgeMessageType.InsertImage: {
        const pos = takeInsertPos(editor);
        // Insert the figure shape directly — every image is a figure, see
        // imageNormalizer.
        editor
          .chain()
          .insertContentAt(pos, {
            type: 'figure',
            content: [{ type: 'image', attrs: { src: message.payload.src } }],
          })
          .run();
        // Caret after the block, ready for typing. A second transaction, so
        // TrailingNode's paragraph exists to land in.
        const { state, view } = editor;
        const after = Math.min(pos + 3, state.doc.content.size);
        const selection = findTextSelectionNear(state, state.doc.resolve(after), 1);
        if (selection) view.dispatch(state.tr.setSelection(selection));
        return true;
      }
      case BridgeMessageType.LeaveImageSession:
        leaveImageSession(editor);
        return true;
      default:
        assertUnhandled(message);
        break;
    }
    return false;
  },
});
