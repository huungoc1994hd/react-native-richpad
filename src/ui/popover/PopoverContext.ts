import { createContext, useContext } from 'react';

type PopoverContextType = {
  closePopover: () => void;
};

export const PopoverContext = createContext<PopoverContextType>({
  closePopover: () => {},
});

export const usePopover = () => useContext(PopoverContext);
