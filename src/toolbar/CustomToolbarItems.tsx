import { Fragment } from 'react';
import type { BridgeState, EditorBridge } from '@10play/tentap-editor';
import { ToolbarButton } from '../ui/ToolbarButton';
import type { ToolbarItem } from './types';

export interface CustomToolbarItemsProps {
  items?: ToolbarItem[];
  editor: EditorBridge;
  state: BridgeState;
}

/** The single place the public `ToolbarItem` contract is honoured, for both bars. */
export const CustomToolbarItems = ({ items, editor, state }: CustomToolbarItemsProps) => (
  <>
    {items?.map(item =>
      item.render ? (
        <Fragment key={item.key}>{item.render({ editor, state })}</Fragment>
      ) : (
        <ToolbarButton
          key={item.key}
          icon={item.icon}
          isActive={item.isActive?.(state)}
          disabled={item.isDisabled?.(state)}
          accessibilityLabel={item.accessibilityLabel}
          onPress={() => item.onPress?.(editor)}
        />
      ),
    )}
  </>
);
