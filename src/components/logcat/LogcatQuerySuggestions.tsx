import { useEffect, useRef } from "react";
import type { QueryCompletion } from "@/lib/logcatQueryCompletion";
import { cn } from "@/lib/utils";

interface LogcatQuerySuggestionsProps {
  completions: readonly QueryCompletion[];
  activeIndex: number;
  currentPackage: string;
  onSelect: (completion: QueryCompletion) => void;
}

export function LogcatQuerySuggestions({
  completions,
  activeIndex,
  currentPackage,
  onSelect,
}: LogcatQuerySuggestionsProps) {
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, completions]);

  if (completions.length === 0) {
    return null;
  }

  return (
    <div
      id="logcat-query-suggestions"
      role="listbox"
      className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-auto rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-lg"
    >
      {completions.map((completion, index) => {
        const detail = completion.kind === "package" && completion.label === "mine"
          ? currentPackage
            ? `当前前台应用: ${currentPackage}`
            : "当前前台应用"
          : completion.detail;
        return (
          <button
            ref={(element) => {
              optionRefs.current[index] = element;
            }}
            key={`${completion.kind}:${completion.label}`}
            id={`logcat-query-option-${index}`}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(completion)}
            className={cn(
              "flex w-full items-center gap-3 px-3 py-1.5 text-left text-xs",
              index === activeIndex
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
            )}
          >
            <span className="min-w-0 flex-1 truncate font-mono">
              {completion.label}
            </span>
            {detail && (
              <span className="max-w-[50%] shrink-0 truncate text-[11px] text-muted-foreground">
                {detail}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
