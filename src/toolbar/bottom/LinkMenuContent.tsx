import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { RichPressable } from '../../ui/RichPressable';
import { useRichTheme } from '../../context/ThemeContext';
import { useLabels } from '../../context/LabelsContext';
import { usePopover } from '../../ui/popover/PopoverContext';
import { ClosePopoverButton } from './ClosePopoverButton';
import { normalizeHref } from './normalizeHref';

export const LinkMenuContent = ({
  initialHref,
  initialText,
  onApply,
  onRemove,
}: {
  initialHref: string;
  /** Prefill for the display-text field: the link's own text when editing, the
   * current selection when creating. Empty on apply = use the URL. */
  initialText: string;
  onApply: (href: string, text: string) => void;
  onRemove: () => void;
}) => {
  const theme = useRichTheme();
  const labels = useLabels();
  const { closePopover } = usePopover();
  const [href, setHref] = useState(initialHref);
  const [text, setText] = useState(initialText);
  const canApply = href.trim().length > 0;

  const fieldStyle = [
    styles.linkInput,
    // Themed inline, not in the stylesheet: the fixed light palette rendered
    // black text on the dark surface.
    { backgroundColor: theme.toolbar.itemActiveBackground, color: theme.toolbar.text },
  ];

  const apply = () => {
    if (!canApply) return;
    onApply(normalizeHref(href), text.trim());
    closePopover();
  };

  return (
    <View style={styles.fullWidth}>
      <View style={styles.linkHeader}>
        <Text style={[styles.linkTitle, { color: theme.toolbar.text }]}>{labels.linkTitle}</Text>
        <ClosePopoverButton />
      </View>
      <TextInput
        value={href}
        onChangeText={setHref}
        placeholder={labels.linkPlaceholder}
        placeholderTextColor={theme.toolbar.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="next"
        // autoFocus: the URL keyboard is shorter than the editor's (no QuickType bar)
        // → the toolbar drops; PopoverMenu re-measures on keyboard events and follows.
        autoFocus
        clearButtonMode="while-editing"
        style={fieldStyle}
      />
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={labels.linkTextPlaceholder}
        placeholderTextColor={theme.toolbar.textMuted}
        returnKeyType="done"
        onSubmitEditing={apply}
        clearButtonMode="while-editing"
        style={fieldStyle}
      />
      <View style={[styles.hairline, { backgroundColor: theme.toolbar.divider }]} />
      <View style={styles.linkActions}>
        {!!initialHref && (
          <>
            <RichPressable
              style={styles.linkAction}
              onPress={() => {
                onRemove();
                closePopover();
              }}
            >
              <View style={styles.linkActionInner}>
                <Text style={[styles.linkActionText, { color: theme.toolbar.danger }]}>
                  {labels.linkRemove}
                </Text>
              </View>
            </RichPressable>
            <View style={[styles.hairlineVertical, { backgroundColor: theme.toolbar.divider }]} />
          </>
        )}
        <RichPressable style={styles.linkAction} disabled={!canApply} onPress={apply}>
          <View style={styles.linkActionInner}>
            <Text
              style={[
                styles.linkActionText,
                styles.linkActionApply,
                { color: canApply ? theme.toolbar.accent : theme.toolbar.textMuted },
              ]}
            >
              {initialHref ? labels.linkUpdate : labels.linkApply}
            </Text>
          </View>
        </RichPressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  fullWidth: {
    width: '100%',
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
    marginTop: 2,
  },
  hairlineVertical: {
    width: StyleSheet.hairlineWidth,
  },
  linkAction: {
    flex: 1,
  },
  linkActionApply: {
    fontWeight: '600',
  },
  linkActionInner: {
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkActionText: {
    fontSize: 15,
  },
  linkActions: {
    flexDirection: 'row',
  },
  linkHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingLeft: 12,
    paddingRight: 8,
    paddingTop: 8,
    marginBottom: 8,
  },
  linkInput: {
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    fontSize: 15,
  },
  linkTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
});
