import { type ReactNode } from 'react';
import { PortalProvider, PortalHost } from '@gorhom/portal';
import { RichEditorContext } from './context/RichEditorContext';
import { ThemeContext } from './context/ThemeContext';
import { LabelsContext } from './context/LabelsContext';
import { IconContext, type RenderIcon } from './context/IconContext';
import { DEFAULT_PORTAL_HOST } from './ui/popover/PopoverMenu';
import type { RichEditorInstance } from './hooks/useRichEditor';

export interface RichEditorProviderProps {
  /** The instance returned by useRichEditor. */
  editor: RichEditorInstance;
  /** Override how toolbar icons are rendered (defaults to MaterialIcons). */
  renderIcon?: RenderIcon;
  children: ReactNode;
}

/**
 * Hosts the popover portal and distributes the editor instance, theme, labels and
 * icon renderer to <RichEditor> and the toolbars. Wrap both in it.
 */
export const RichEditorProvider = ({ editor, renderIcon, children }: RichEditorProviderProps) => {
  return (
    <PortalProvider>
      <RichEditorContext.Provider value={editor}>
        <ThemeContext.Provider value={editor.resolvedTheme}>
          <LabelsContext.Provider value={editor.resolvedLabels}>
            <IconContext.Provider value={renderIcon}>
              {children}
              <PortalHost name={DEFAULT_PORTAL_HOST} />
            </IconContext.Provider>
          </LabelsContext.Provider>
        </ThemeContext.Provider>
      </RichEditorContext.Provider>
    </PortalProvider>
  );
};
