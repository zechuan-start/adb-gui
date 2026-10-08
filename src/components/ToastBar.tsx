import { useT, translateError } from "@/i18n";
import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";
import { useFeedbackStore, type ToastState } from "@/store/feedback";
import { cn } from "@/lib/utils";

// Errors stay longer than confirmations; hovering or focusing a toast holds it open.
const TOAST_DURATION_MS = { success: 3000, error: 8000 } as const;

export function ToastBar() {
  const toast = useFeedbackStore((s) => s.toast);
  const toastId = useFeedbackStore((s) => s.toastId);

  if (!toast) {
    return null;
  }

  // Keyed per toast so a replaced toast starts a fresh countdown and hold state.
  return <Toast key={toastId} toast={toast} />;
}

function Toast({ toast }: { toast: ToastState }) {
  const t = useT();
  const clearToast = useFeedbackStore((s) => s.clearToast);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const held = hovered || focused;

  useEffect(() => {
    if (held) {
      return;
    }

    const timer = window.setTimeout(() => {
      clearToast();
    }, TOAST_DURATION_MS[toast.kind]);

    return () => window.clearTimeout(timer);
  }, [held, toast.kind, clearToast]);

  return (
    <div
      className="fixed bottom-4 left-[184px] z-50 w-[min(340px,calc(100vw-200px))]"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <div
        role={toast.kind === "success" ? "status" : "alert"}
        aria-live={toast.kind === "success" ? "polite" : "assertive"}
        className={cn(
          "flex min-h-11 items-center gap-3 border border-l-[3px] bg-paper px-3 py-2 font-data text-[11px] text-ink shadow-[3px_3px_0_var(--color-hard-shadow)]",
          toast.kind === "success"
            ? "border-success/50 border-l-success"
            : "border-destructive/50 border-l-destructive"
        )}
      >
        {toast.kind === "success" ? (
          <CheckCircle2 className="h-4 w-4 text-success" />
        ) : (
          <AlertCircle className="h-4 w-4 text-destructive" />
        )}
        <span className="min-w-0 flex-1 break-words leading-5">{typeof toast.message === "function" ? toast.message(t) : translateError(toast.message, t)}</span>
        <button
          type="button"
          onClick={clearToast}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-ink3 hover:bg-hover hover:text-ink"
          title={t.common.close}
          aria-label={t.common.closeNotification}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
