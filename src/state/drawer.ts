import { create } from "zustand";

/** The item drawer opens from any document reference in any module. */
interface ItemDrawerState {
  itemKey?: string;
  open: (itemKey: string) => void;
  close: () => void;
}

export const useItemDrawer = create<ItemDrawerState>((set) => ({
  itemKey: undefined,
  open: (itemKey) => set({ itemKey }),
  close: () => set({ itemKey: undefined }),
}));
