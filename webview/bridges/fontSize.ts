import { BridgeExtension } from '@10play/tentap-editor/web';
import { Extension } from '@tiptap/core';
import { TextStyle } from '@tiptap/extension-text-style';
import { BridgeMessageType, FontSizeBridgeMessage, FontSizeBridgeState } from '../../src/protocol';
import { assertUnhandled } from '../domUtils';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSizeAttribute: {
      /** Set the font size of the current selection, e.g. `'18px'`. */
      setFontSize: (fontSize: string) => ReturnType;
      /** Clear it, dropping the textStyle mark when nothing else is left on it. */
      unsetFontSize: () => ReturnType;
    };
  }
}

/** A `fontSize` attribute on the textStyle mark, and the commands that set it. */
const FontSizeAttribute = Extension.create({
  name: 'fontSizeAttribute',
  addOptions() {
    return { types: ['textStyle'] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            // `|| null`, not `?.`: CSSStyleDeclaration returns an EMPTY STRING for an
            // unset property, which would land as '' and blank the toolbar label.
            parseHTML: element => element.style.fontSize?.replace(/['"]+/g, '') || null,
            renderHTML: attributes => {
              if (!attributes.fontSize) return {};
              return { style: `font-size: ${attributes.fontSize}` };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize:
        fontSize =>
        ({ chain }) =>
          chain().setMark('textStyle', { fontSize }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});

export const FontSizeBridge = new BridgeExtension<
  FontSizeBridgeState,
  Record<string, never>,
  FontSizeBridgeMessage
>({
  // MUST stay TextStyle: it names the bridge, and RN keys this one 'textStyle'
  // by that name. Never TextStyleKit — its FontSize takes over the attribute below.
  tiptapExtension: TextStyle,
  tiptapExtensionDeps: [FontSizeAttribute],
  onBridgeMessage: (editor, message) => {
    switch (message.type) {
      case BridgeMessageType.SetFontSize:
        editor.chain().focus().setFontSize(message.payload).run();
        break;
      case BridgeMessageType.UnsetFontSize:
        editor.chain().focus().unsetFontSize().run();
        break;
      default:
        assertUnhandled(message);
        break;
    }
    return false;
  },
  extendEditorState: editor => {
    return {
      fontSize: editor.getAttributes('textStyle').fontSize,
    };
  },
});
