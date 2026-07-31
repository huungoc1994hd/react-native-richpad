import { StyleSheet, View } from 'react-native';
import { useRichTheme } from '../context/ThemeContext';

/** Vertical hairline between toolbar button groups. */
export const ToolbarDivider = () => {
  const theme = useRichTheme();
  return <View style={[styles.divider, { backgroundColor: theme.toolbar.border }]} />;
};

const styles = StyleSheet.create({
  divider: {
    width: 1,
    height: 20,
    marginHorizontal: 4,
  },
});
