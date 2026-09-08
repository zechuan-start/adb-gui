import { cn } from "@/lib/utils";

interface ChipGroupOption<K extends string> {
  value: K;
  label: string;
}

interface ChipGroupProps<K extends string> {
  options: ReadonlyArray<ChipGroupOption<K>>;
  selected: Readonly<Record<K, boolean>>;
  onToggle: (value: K, selected: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
}

export function ChipGroup<K extends string>({
  options,
  selected,
  onToggle,
  ariaLabel,
  disabled = false,
}: ChipGroupProps<K>) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
      {options.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          aria-pressed={selected[value]}
          disabled={disabled}
          onClick={() => onToggle(value, !selected[value])}
          className={cn(
            "h-7 border border-rule px-2.5 text-xs outline-none hover:bg-hover focus-visible:border-note disabled:cursor-not-allowed disabled:opacity-40",
            selected[value] && "bg-ink text-onink hover:bg-ink",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
