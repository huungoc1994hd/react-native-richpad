import { createContext, useContext, type ReactNode } from 'react';
import type { RichIconName } from '../ui/RichIcon';

/** Override how toolbar icons are rendered (defaults to MaterialIcons). */
export type RenderIcon = (name: RichIconName, size: number, color: string) => ReactNode;

export const IconContext = createContext<RenderIcon | undefined>(undefined);

export const useRenderIcon = (): RenderIcon | undefined => useContext(IconContext);
