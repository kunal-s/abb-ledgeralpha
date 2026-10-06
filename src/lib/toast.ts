import { create } from "zustand";

export type ToastTone = "default" | "ok" | "warn" | "danger" | "info";

export interface Toast {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => void;
  dismiss: (id: number) => void;
}

let counter = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = counter++;
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
    }, 4200);
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

/** Fire a toast imperatively from anywhere (demo confirmations). */
export function toast(
  title: string,
  opts?: { description?: string; tone?: ToastTone }
) {
  useToastStore.getState().push({
    title,
    description: opts?.description,
    tone: opts?.tone ?? "default",
  });
}
