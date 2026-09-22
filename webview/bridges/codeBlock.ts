import { BridgeExtension } from '@10play/tentap-editor/web';
import { mergeAttributes } from '@tiptap/core';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import {
  BridgeMessageType,
  CodeBlockBridgeMessage,
  CodeBlockBridgeState,
} from '../../src/protocol';
import { assertUnhandled } from '../domUtils';

// The `common` set (37 grammars); the web editor highlights with the same library.
const lowlight = createLowlight(common);

/**
 * CodeBlockLowlight with the language echoed on <pre data-language>, which the
 * stylesheet prints as a corner label. Parsing still reads the `language-` class.
 */
const LabeledCodeBlock = CodeBlockLowlight.extend({
  renderHTML({ node, HTMLAttributes }) {
    const language = (node.attrs.language as string | null | undefined) || null;
    return [
      'pre',
      mergeAttributes(
        this.options.HTMLAttributes,
        HTMLAttributes,
        language ? { 'data-language': language } : {},
      ),
      ['code', { class: language ? this.options.languageClassPrefix + language : null }, 0],
    ];
  },
});

/**
 * Code blocks with lowlight highlighting. The language round-trips as
 * `<pre><code class="language-xx">`, the shape the app's Markdown converter reads.
 */
export const CodeBlockBridge = new BridgeExtension<
  CodeBlockBridgeState,
  Record<string, never>,
  CodeBlockBridgeMessage
>({
  // 'plaintext' keeps a block without a language uncoloured instead of auto-detected;
  // exitOnTripleEnter and exitOnArrowDown stay at their defaults (true).
  tiptapExtension: LabeledCodeBlock.configure({ lowlight, defaultLanguage: 'plaintext' }),
  onBridgeMessage: (editor, message) => {
    switch (message.type) {
      case BridgeMessageType.ToggleCodeBlock:
        editor.chain().focus().toggleCodeBlock().run();
        break;
      case BridgeMessageType.SetCodeBlockLanguage:
        editor.chain().focus().updateAttributes('codeBlock', { language: message.payload }).run();
        break;
      default:
        assertUnhandled(message);
        break;
    }
    return false;
  },
  extendEditorState: editor => {
    const active = editor.isActive('codeBlock');
    const language = editor.getAttributes('codeBlock').language as string | null | undefined;
    return { isCodeBlockActive: active, codeBlockLanguage: active ? (language ?? null) : null };
  },
});
