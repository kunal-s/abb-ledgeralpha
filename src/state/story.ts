import { create } from "zustand";

/** The walkthrough in progress: which thread, which step. */
interface StoryState {
  threadId?: string;
  step: number;
  start: (threadId: string) => void;
  go: (step: number) => void;
  exit: () => void;
}

export const useStory = create<StoryState>((set) => ({
  threadId: undefined,
  step: 0,
  start: (threadId) => set({ threadId, step: 0 }),
  go: (step) => set({ step: Math.max(0, step) }),
  exit: () => set({ threadId: undefined, step: 0 }),
}));
