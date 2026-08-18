import { BridgeExtension } from '@10play/tentap-editor/web';
import { TextAlign } from '@tiptap/extension-text-align';
import { AlignBridgeMessage, AlignBridgeState, BridgeMessageType } from '../../src/protocol';
import { assertUnhandled } from '../domUtils';

export const AlignBridge = new BridgeExtension<
  AlignBridgeState,
  Record<string, never>,
  AlignBridgeMessage
>({
  tiptapExtension: TextAlign.configure({ types: ['heading', 'paragraph'] }),
  onBridgeMessage: (editor, message) => {
    switch (message.type) {
      case BridgeMessageType.SetAlign:
        editor.chain().focus().setTextAlign(message.payload).run();
        break;
      default:
        assertUnhandled(message.type);
        break;
    }
    return false;
  },
  extendEditorState: editor => {
    return {
      textAlign: editor.isActive({ textAlign: 'center' })
        ? 'center'
        : editor.isActive({ textAlign: 'right' })
          ? 'right'
          : editor.isActive({ textAlign: 'justify' })
            ? 'justify'
            : 'left',
    };
  },
});
