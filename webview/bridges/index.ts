import { HistoryBridge, TenTapStartKit } from '@10play/tentap-editor/web';
import { AlignBridge } from './align';
import { ConfigBridge } from './config';
import { FormatBridge } from './format';
import { FontSizeBridge } from './fontSize';
import { CaptionAwareHistoryBridge } from './history';
import { MediaBridge } from './media';
import { SearchBridge } from './search';
import { TableBridge } from './table';

/**
 * Every bridge the WebView registers, in dispatch order. tiptap's duplicate-name
 * warning is expected — do NOT filter the spare registrations.
 */
export const richpadBridges = [
  // The stock HistoryBridge is REPLACED by the caption-aware one.
  ...TenTapStartKit.filter(bridge => bridge !== HistoryBridge),
  CaptionAwareHistoryBridge,
  AlignBridge,
  FontSizeBridge,
  TableBridge,
  MediaBridge,
  ConfigBridge,
  SearchBridge,
  FormatBridge,
];
