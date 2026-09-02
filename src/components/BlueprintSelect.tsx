import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BlueprintSelectOption {
  value: string;
  label: string;
}

interface BlueprintSelectProps {
  value: string;
  options: readonly BlueprintSelectOption[];
  onValueChange: (value: string) => void;
  ariaLabel: string;
  id?: string;
  emptyLabel?: string;
  disabled?: boolean;
  containerClassName?: string;
  className?: string;
  menuClassName?: string;
  optionClassName?: string;
  chevronClassName?: string;
  renderValue?: (option: BlueprintSelectOption | null) => ReactNode;
  renderOption?: (option: BlueprintSelectOption, selected: boolean) => ReactNode;
}

export function BlueprintSelect({
  value,
  options,
  onValueChange,
  ariaLabel,
  id,
  emptyLabel = "没有可选项",
  disabled = false,
  containerClassName,
  className,
  menuClassName,
  optionClassName,
  chevronClassName,
  renderValue,
  renderOption,
}: BlueprintSelectProps) {
  const generatedId = useId();
  const menuId = `${id ?? generatedId}-menu`;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const initialFocusIndexRef = useRef(0);
  const shouldFocusOptionRef = useRef(false);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null;
  const unavailable = disabled || options.length === 0;
  const optionSignature = options
    .map((option) => `${option.value}\u0000${option.label}`)
    .join("\u0001");
  const previousOptionSignatureRef = useRef(optionSignature);

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const focusFrame = shouldFocusOptionRef.current
      ? window.requestAnimationFrame(() => {
          optionRefs.current[initialFocusIndexRef.current]?.focus();
        })
      : null;

    function handlePointerDown(event: PointerEvent): void {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        close();
      }
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      if (focusFrame !== null) {
        window.cancelAnimationFrame(focusFrame);
      }
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [close, open]);

  useEffect(() => {
    if (unavailable) {
      close();
    }
  }, [close, unavailable]);

  useEffect(() => {
    const optionsChanged = previousOptionSignatureRef.current !== optionSignature;
    previousOptionSignatureRef.current = optionSignature;
    if (open && optionsChanged) {
      close(true);
    }
  }, [close, open, optionSignature]);

  function openAt(index: number, focusOption = true): void {
    if (unavailable) {
      return;
    }
    const nextIndex = Math.max(0, Math.min(index, options.length - 1));
    initialFocusIndexRef.current = nextIndex;
    shouldFocusOptionRef.current = focusOption;
    if (open) {
      if (focusOption) {
        optionRefs.current[nextIndex]?.focus();
      }
      return;
    }
    setOpen(true);
  }

  function moveFocus(index: number): void {
    const nextIndex = (index + options.length) % options.length;
    optionRefs.current[nextIndex]?.focus();
  }

  function choose(valueToSelect: string): void {
    onValueChange(valueToSelect);
    close(true);
  }

  function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openAt(selectedIndex >= 0 ? selectedIndex : 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openAt(selectedIndex >= 0 ? selectedIndex : options.length - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      openAt(0);
    } else if (event.key === "End") {
      event.preventDefault();
      openAt(options.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) {
        close();
      } else {
        openAt(selectedIndex >= 0 ? selectedIndex : 0);
      }
    }
  }

  function handleOptionKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
    optionValue: string,
  ): void {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveFocus(index + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveFocus(index - 1);
        break;
      case "Home":
        event.preventDefault();
        moveFocus(0);
        break;
      case "End":
        event.preventDefault();
        moveFocus(options.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(optionValue);
        break;
      case "Tab":
        close();
        break;
    }
  }

  return (
    <div ref={rootRef} className={cn("relative min-w-0", containerClassName)}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-label={`${ariaLabel}: ${selectedOption?.label ?? emptyLabel}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={unavailable}
        onClick={() => {
          if (open) {
            close();
          } else {
            openAt(selectedIndex >= 0 ? selectedIndex : 0, false);
          }
        }}
        onKeyDown={handleTriggerKeyDown}
        className={cn(
          "flex h-9 w-full min-w-0 items-center justify-between gap-2 border border-rule bg-surface px-3 font-data text-xs text-ink outline-none hover:border-ink3 focus-visible:border-note disabled:cursor-not-allowed disabled:opacity-55",
          className,
        )}
      >
        {renderValue ? renderValue(selectedOption) : (
          <span className="min-w-0 truncate text-left">
            {selectedOption?.label ?? emptyLabel}
          </span>
        )}
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "h-4 w-4 shrink-0 text-ink3",
            chevronClassName,
          )}
        />
      </button>

      {open && (
        <div
          id={menuId}
          role="listbox"
          aria-label={ariaLabel}
          className={cn(
            "absolute left-0 right-0 top-full z-50 mt-2 max-h-60 origin-top-left overflow-y-auto border border-rule bg-paper p-0 text-ink shadow-[4px_4px_0_var(--color-hard-shadow)] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-150",
            menuClassName,
          )}
        >
          {options.map((option, index) => {
            const selected = option.value === value;
            return (
              <button
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => choose(option.value)}
                onKeyDown={(event) => handleOptionKeyDown(event, index, option.value)}
                className={cn(
                  "flex min-h-9 w-full min-w-0 items-center gap-2 border-b border-dashed border-rule px-[11px] py-2 font-data text-[11.5px] text-ink outline-none last:border-b-0 hover:bg-hover",
                  selected
                    ? "bg-note/[0.14] focus-visible:bg-note/[0.14]"
                    : "focus-visible:bg-hover",
                  optionClassName,
                )}
              >
                {renderOption ? renderOption(option, selected) : (
                  <span className="min-w-0 truncate text-left">{option.label}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
