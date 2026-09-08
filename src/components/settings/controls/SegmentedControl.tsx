import { useRef, type KeyboardEvent, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

interface SegmentedControlProps<T extends string> {
  value?: T;
  options: ReadonlyArray<SegmentedControlOption<T>>;
  onChange: (value: T) => void;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  disabled = false,
  className,
}: SegmentedControlProps<T>): ReactNode {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = options.findIndex((option) => option.value === value);

  function select(index: number): void {
    const option = options[index];
    if (!option || disabled) return;
    onChange(option.value);
    refs.current[index]?.focus();
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ): void {
    const last = options.length - 1;
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % options.length
        : event.key === "ArrowLeft"
          ? (index + options.length - 1) % options.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null || options.length === 0) return;
    event.preventDefault();
    select(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("inline-flex max-w-full border border-rule", className)}
    >
      {options.map(({ value: optionValue, label, icon: Icon }, index) => {
        const selected = optionValue === value;
        return (
          <button
            ref={(element) => {
              refs.current[index] = element;
            }}
            key={optionValue}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selectedIndex < 0 ? (index === 0 ? 0 : -1) : selected ? 0 : -1}
            disabled={disabled}
            onClick={() => select(index)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              "inline-flex h-8 min-w-0 items-center justify-center gap-1.5 border-r border-rule px-3 text-xs outline-none last:border-r-0 hover:bg-hover focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-2px] focus-visible:outline-note disabled:cursor-not-allowed disabled:opacity-40",
              selected && "bg-ink text-onink hover:bg-ink",
            )}
          >
            {Icon && <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />}
            <span className="truncate">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
