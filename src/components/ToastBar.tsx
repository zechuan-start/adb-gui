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
    <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4">
      <div
        className={cn(
          "mx-auto flex max-w-4xl items-center gap-3 rounded-lg border px-4 py-2 shadow-lg",
          toast.kind === "success"
            ? "border-success/50 bg-success-surface text-foreground"
            : "border-destructive/50 bg-destructive-surface text-foreground"
        )}
      >
        {toast.kind === "success" ? (
          <CheckCircle2 className="h-4 w-4 text-success" />
        ) : (
          <AlertCircle className="h-4 w-4 text-destructive" />
        )}
        <span className="min-w-0 flex-1 truncate text-sm">{toast.message}</span>
        <button
          type="button"
          onClick={clearToast}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
          title="关闭"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
