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
      className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-auto border border-rule bg-paper text-ink shadow-[3px_3px_0_var(--color-hard-shadow)]"
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
              "flex min-h-8 w-full items-center gap-3 border-b border-dashed border-rule px-3 py-1.5 text-left text-xs last:border-b-0",
              index === activeIndex
                ? "bg-note/[0.14] text-ink"
                : "text-ink2 hover:bg-hover hover:text-ink",
            )}
          >
            <span className="min-w-0 flex-1 truncate font-data">
              {completion.label}
            </span>
            {detail && (
              <span className="max-w-[50%] shrink-0 truncate font-data text-[10px] text-ink3">
                {detail}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
