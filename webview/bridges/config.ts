import { BridgeExtension } from '@10play/tentap-editor/web';
import { BridgeMessageType, ConfigBridgeMessage } from '../../src/protocol';
import { applyEditorConfig, hostChromeState } from '../configStore';
import { assertUnhandled } from '../domUtils';
import { syncVisibleHeight } from '../scrollCoordinator';

/** Config bridge — receives labels/theme and keyboard events from RN. */
export const ConfigBridge = new BridgeExtension<
  Record<string, never>,
  Record<string, never>,
  ConfigBridgeMessage
>({
  forceName: 'editorConfig',
  onBridgeMessage: (_editor, message) => {
    switch (message.type) {
      case BridgeMessageType.InitConfig:
        applyEditorConfig(message.payload);
        return true;
      case BridgeMessageType.KeyboardWillShow:
        hostChromeState.overlap = Math.max(0, message.payload.hostChromeOverlap);
        syncVisibleHeight();
        return true;
      default:
        assertUnhandled(message);
        break;
    }
    return false;
  },
});
