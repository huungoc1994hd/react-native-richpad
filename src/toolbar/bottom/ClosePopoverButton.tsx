import { StyleSheet } from 'react-native';
import { RichPressable } from '../../ui/RichPressable';
import { RichIcon } from '../../ui/RichIcon';
import { useRichTheme } from '../../context/ThemeContext';
import { usePopover } from '../../ui/popover/PopoverContext';

/** The × every popover header carries, so closing is the same gesture everywhere. */
export const ClosePopoverButton = () => {
  const theme = useRichTheme();
  const { closePopover } = usePopover();
  return (
    <RichPressable
      onPress={() => closePopover()}
      style={[styles.closeButton, { backgroundColor: theme.toolbar.itemActiveBackground }]}
    >
      <RichIcon name="close" size={16} color={theme.toolbar.icon} />
    </RichPressable>
  );
};

const styles = StyleSheet.create({
  closeButton: {
    padding: 4,
    borderRadius: 999,
  },
});
