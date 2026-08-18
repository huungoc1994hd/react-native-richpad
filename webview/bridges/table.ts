import { BridgeExtension } from '@10play/tentap-editor/web';
import { Table } from '@tiptap/extension-table';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableRow } from '@tiptap/extension-table-row';
import { BridgeMessageType, TableBridgeMessage, TableBridgeState } from '../../src/protocol';
import { DEFAULT_METRICS, getEditorMetrics } from '../configStore';
import { assertUnhandled, IS_ANDROID } from '../domUtils';
import {
  focusCaptionFieldDirect,
  getCaptionOwner,
  getCaptionSessionState,
} from '../extensions/captionSession';
import { setSavedInsertPos, takeInsertPos } from './insertPosition';

export const TableBridge = new BridgeExtension<
  TableBridgeState,
  Record<string, never>,
  TableBridgeMessage
>({
  forceName: 'table',
  // cellMinWidth floors a column with no colwidth of its own; tiptap's default 25
  // renders such a column as a sliver. From the defaults: InitConfig arrives later.
  tiptapExtension: Table.configure({
    resizable: true,
    cellMinWidth: DEFAULT_METRICS.tableMinCellWidth,
  }),
  tiptapExtensionDeps: [TableRow, TableHeader, TableCell],
  onBridgeMessage: (editor, message) => {
    // Chained commands run EAGERLY, and every message reaches every bridge, so build
    // the chain lazily — otherwise focus() fires for messages this switch ignores.
    const chain = () => editor.chain().focus();
    switch (message.type) {
      case BridgeMessageType.InsertTable: {
        const { cols } = message.payload;
        // Insert at the pre-blur cursor (see savedInsertPos).
        editor.chain().focus(takeInsertPos(editor)).insertTable(message.payload).run();
        try {
          const state = editor.state;
          const $pos = state.selection.$anchor;
          for (let d = $pos.depth; d > 0; d--) {
            const node = $pos.node(d);
            if (node.type.name === 'table') {
              const tablePos = $pos.before(d);
              // 40 = ProseMirror's horizontal padding (18 x 2) + slack for the
              // collapsed borders, so a full-width table never scrolls sideways.
              const viewportWidth = window.innerWidth - 40;
              const minCellWidth = getEditorMetrics().tableMinCellWidth;
              let targetTableWidth = cols * minCellWidth;
              if (targetTableWidth < viewportWidth) {
                targetTableWidth = viewportWidth;
              }
              const colWidth = Math.floor(targetTableWidth / cols);
              const colwidthArray = [colWidth];
              let tr = state.tr;
              node.descendants((child, pos) => {
                if (child.type.name === 'tableCell' || child.type.name === 'tableHeader') {
                  tr = tr.setNodeMarkup(tablePos + 1 + pos, null, {
                    ...child.attrs,
                    colwidth: colwidthArray,
                  });
                }
              });
              editor.view.dispatch(tr);
              break;
            }
          }
        } catch {
          // Column pre-sizing is best-effort; the table is already inserted.
        }
        break;
      }
      case BridgeMessageType.AddRowBefore:
        chain().addRowBefore().run();
        break;
      case BridgeMessageType.AddRowAfter:
        chain().addRowAfter().run();
        break;
      case BridgeMessageType.AddColumnBefore:
        chain().addColumnBefore().run();
        break;
      case BridgeMessageType.AddColumnAfter:
        chain().addColumnAfter().run();
        break;
      case BridgeMessageType.DeleteRow:
        chain().deleteRow().run();
        break;
      case BridgeMessageType.DeleteColumn:
        chain().deleteColumn().run();
        break;
      case BridgeMessageType.DeleteTable:
        chain().deleteTable().run();
        break;
      case BridgeMessageType.MergeCells:
        chain().mergeCells().run();
        break;
      case BridgeMessageType.SplitCell:
        chain().splitCell().run();
        break;
      case BridgeMessageType.ForceBlur: {
        // Freeze BEFORE blurring — blur/removeAllRanges resets PM's selection.
        setSavedInsertPos(editor.state.selection.to);
        const activeEl = document.activeElement as HTMLElement | null;
        if (activeEl) activeEl.blur();
        window.getSelection()?.removeAllRanges();
        editor.commands.blur();
        // Ack: DOM focus is fully gone, so RN can resign first responder without
        // WKWebView reclaiming it.
        window.ReactNativeWebView?.postMessage(
          JSON.stringify({ type: BridgeMessageType.BlurAck, payload: undefined }),
        );
        break;
      }
      case BridgeMessageType.RestoreInputFocus: {
        // Second half of the Android IME dance: return DOM focus to whichever editing
        // host owns the session (quirk 10).
        const captionField = getCaptionOwner();
        if (captionField) {
          // Only a PENDING session is completed here: a focused field would lose its
          // tap position to a caret reset.
          if (getCaptionSessionState() === 'pending') {
            focusCaptionFieldDirect(captionField);
          }
          break;
        }
        // Only Android focuses the editor (its IME dance needs it). iOS also receives
        // this during teardown, where it would steal the keyboard from a host control.
        if (IS_ANDROID) {
          editor.commands.focus(null);
        }
        break;
      }
      default:
        assertUnhandled(message);
        break;
    }
    return false;
  },
  extendEditorState: editor => {
    return {
      isTableActive: editor.isActive('table'),
      canMergeCells: editor.can().mergeCells(),
      canSplitCell: editor.can().splitCell(),
    };
  },
});
