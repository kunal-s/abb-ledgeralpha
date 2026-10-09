import { create } from "zustand";
import { LINE_BY_KEY } from "@/data";

/** The screen a ledger line is worked on: its way from the source to the signed account. */
export const itemPath = (itemKey: string) => `/balance-sheet-review/item/${encodeURIComponent(itemKey)}`;

let navigate: ((to: string) => void) | undefined;
/** The shell hands over the router's navigate so a document reference can open its screen from anywhere. */
export function setItemNavigator(fn: ((to: string) => void) | undefined) {
  navigate = fn;
}

/**
 * Any document reference in any module opens here. A ledger line opens its own screen;
 * a reconciling item still opens in the drawer beside its reconciliation.
 */
interface ItemDrawerState {
  itemKey?: string;
  open: (itemKey: string) => void;
  close: () => void;
}

export const useItemDrawer = create<ItemDrawerState>((set) => ({
  itemKey: undefined,
  open: (itemKey) => {
    if (navigate && LINE_BY_KEY.has(itemKey)) {
      set({ itemKey: undefined });
      navigate(itemPath(itemKey));
      return;
    }
    set({ itemKey });
  },
  close: () => set({ itemKey: undefined }),
}));
