import { memo } from 'react';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useRenderIcon } from '../context/IconContext';

/**
 * Semantic icon names used by the toolbars. They map 1:1 to MaterialIcons glyph
 * names; consumers can remap them to any icon set via the provider's `renderIcon`.
 */
export type RichIconName =
  | 'undo'
  | 'redo'
  | 'arrow-drop-down'
  | 'table-chart'
  | 'image'
  | 'photo-library'
  | 'photo-camera'
  | 'search'
  | 'keyboard-arrow-up'
  | 'keyboard-arrow-down'
  | 'close'
  | 'check-box'
  | 'add'
  | 'format-color-fill'
  | 'format-bold'
  | 'format-italic'
  | 'format-underlined'
  | 'format-strikethrough'
  | 'link'
  | 'format-list-numbered'
  | 'format-list-bulleted'
  | 'format-align-left'
  | 'format-align-center'
  | 'format-align-right'
  | 'format-align-justify'
  | 'select-all'
  | 'format-clear'
  | 'check';

export interface RichIconProps {
  name: RichIconName;
  size?: number;
  color?: string;
}

export const RichIcon = memo(({ name, size = 24, color = '#000000' }: RichIconProps) => {
  const renderIcon = useRenderIcon();
  if (renderIcon) {
    return <>{renderIcon(name, size, color)}</>;
  }
  return <MaterialIcons name={name} size={size} color={color} />;
});

RichIcon.displayName = 'RichIcon';
