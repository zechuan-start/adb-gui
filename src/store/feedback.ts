import { create } from "zustand";

export type ToastKind = "success" | "error";

export interface ToastState {
  kind: ToastKind;
  message: string;
}

interface FeedbackStore {
  toast: ToastState | null;
  toastId: number;
  showToast: (kind: ToastKind, message: string) => void;
  clearToast: () => void;
}

export const useFeedbackStore = create<FeedbackStore>((set) => ({
  toast: null,
  toastId: 0,
  showToast: (kind, message) =>
    set((state) => ({
      toast: { kind, message },
      toastId: state.toastId + 1,
    })),
  clearToast: () => set({ toast: null }),
}));
