import { useEffect } from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";
import { useFeedbackStore } from "@/store/feedback";
import { cn } from "@/lib/utils";

export function ToastBar() {
  const toast = useFeedbackStore((s) => s.toast);
  const toastId = useFeedbackStore((s) => s.toastId);
  const clearToast = useFeedbackStore((s) => s.clearToast);

  useEffect(() => {
    if (!toast || toast.kind !== "success") {
      return;
    }

    const timer = window.setTimeout(() => {
      clearToast();
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [toastId, toast, clearToast]);

  if (!toast) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-[184px] z-50 w-[min(340px,calc(100vw-200px))]">
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
        <span className="min-w-0 flex-1 break-words leading-5">{toast.message}</span>
        <button
          type="button"
          onClick={clearToast}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-ink3 hover:bg-hover hover:text-ink"
          title="关闭"
          aria-label="关闭通知"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
