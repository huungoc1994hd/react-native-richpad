import { BridgeExtension } from '@10play/tentap-editor/web';
import { BridgeMessageType, SearchBridgeMessage, SearchBridgeState } from '../../src/protocol';
import { assertUnhandled } from '../domUtils';
import {
  clearSearch,
  getSearchState,
  SearchHighlight,
  searchStep,
  setSearchQuery,
} from '../extensions/searchHighlight';

/**
 * In-note search bridge. NAMING RULE: a bridge carrying a tiptapExtension takes that
 * extension's name, and RN must forceName the same string.
 */
export const SearchBridge = new BridgeExtension<
  SearchBridgeState,
  Record<string, never>,
  SearchBridgeMessage
>({
  tiptapExtension: SearchHighlight,
  onBridgeMessage: (editor, message) => {
    switch (message.type) {
      case BridgeMessageType.SearchSetQuery:
        setSearchQuery(editor, message.payload.query);
        return true;
      case BridgeMessageType.SearchNext:
        searchStep(editor, 1);
        return true;
      case BridgeMessageType.SearchPrev:
        searchStep(editor, -1);
        return true;
      case BridgeMessageType.SearchClear:
        clearSearch(editor);
        return true;
      default:
        assertUnhandled(message);
        break;
    }
    return false;
  },
  extendEditorState: editor => {
    const state = getSearchState(editor);
    return {
      searchMatches: state.matches.length,
      searchActiveIndex: state.activeIndex,
    };
  },
});
