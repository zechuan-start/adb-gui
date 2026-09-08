import { create } from "zustand";
import type { Message } from "@/i18n/types";
import type { AppErrorPayload } from "@/i18n/errors";

export type ToastKind = "success" | "error";
export type ToastMessage = Message | AppErrorPayload;

export interface ToastState {
  kind: ToastKind;
  message: ToastMessage;
}

interface FeedbackStore {
  toast: ToastState | null;
  toastId: number;
  showToast: (kind: ToastKind, message: ToastMessage) => void;
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
