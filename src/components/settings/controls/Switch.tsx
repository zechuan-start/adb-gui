import { cn } from "@/lib/utils";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  id?: string;
  disabled?: boolean;
  ariaLabel?: string;
  ariaLabelledBy?: string;
}

export function Switch({
  checked,
  onCheckedChange,
  id,
  disabled = false,
  ariaLabel,
  ariaLabelledBy,
}: SwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "flex h-5 w-9 shrink-0 items-center border border-rule p-[3px] outline-none transition-colors hover:border-ink3 focus-visible:border-note disabled:cursor-not-allowed disabled:opacity-40",
        checked ? "bg-ink" : "bg-surface",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "h-3 w-3 border transition-transform",
          checked
            ? "translate-x-4 border-onink bg-onink"
            : "translate-x-0 border-rule bg-paper",
        )}
      />
    </button>
  );
}
