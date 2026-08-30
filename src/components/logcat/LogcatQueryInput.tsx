import { useEffect, useRef, type ChangeEvent, type FocusEvent } from "react";
import { AlertCircle, Search, X } from "lucide-react";
import { useLogcatQueryCompletions } from "@/hooks/useLogcatQueryCompletions";
import type { LogcatPackageResolutionState } from "@/hooks/useLogcatPackageResolution";
import { cn } from "@/lib/utils";
import { useLogcatStore } from "@/store/logcat";
import { LogcatQuerySuggestions } from "@/components/logcat/LogcatQuerySuggestions";

const QUERY_DEBOUNCE_MS = 150;
const QUERY_ERROR_ID = "logcat-query-error";
const QUERY_STATUS_ID = "logcat-query-status";

interface LogcatQueryInputProps {
  packageResolution: LogcatPackageResolutionState;
}

export function LogcatQueryInput({ packageResolution }: LogcatQueryInputProps) {
  const queryInput = useLogcatStore((state) => state.queryInput);
  const queryError = useLogcatStore((state) => state.queryError);
  const setQueryInput = useLogcatStore((state) => state.setQueryInput);
  const commitQuery = useLogcatStore((state) => state.commitQuery);
  const rootRef = useRef<HTMLDivElement>(null);
  const completion = useLogcatQueryCompletions({
    queryInput,
    setQueryInput,
    packageResolution,
  });
  const hasStatus = Boolean(
    packageResolution.packageStatus || packageResolution.loadingPackages,
  );
  const describedBy = [
    queryError ? QUERY_ERROR_ID : null,
    hasStatus ? QUERY_STATUS_ID : null,
  ].filter(Boolean).join(" ") || undefined;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const state = useLogcatStore.getState();
      if (state.activeQuery !== queryInput || state.queryError !== null) {
        commitQuery(queryInput);
      }
    }, QUERY_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [commitQuery, queryInput]);

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    const value = event.currentTarget.value;
    const nextCursor = event.currentTarget.selectionStart ?? value.length;
    setQueryInput(value);
    completion.openMenu(value, nextCursor, false);
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>): void {
    if (
      event.relatedTarget instanceof Node &&
      rootRef.current?.contains(event.relatedTarget)
    ) {
      return;
    }
    completion.closeMenu();
  }

  return (
    <div ref={rootRef} className="relative min-w-[260px] flex-1" onBlur={handleBlur}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={completion.inputRef}
          role="combobox"
          aria-label="Logcat 查询"
          aria-autocomplete="list"
          aria-expanded={completion.open && completion.completions.length > 0}
          aria-controls={completion.open && completion.completions.length > 0
            ? "logcat-query-suggestions"
            : undefined}
          aria-activedescendant={completion.open && completion.completions.length > 0
            ? `logcat-query-option-${completion.activeIndex}`
            : undefined}
          aria-describedby={describedBy}
          aria-errormessage={queryError ? QUERY_ERROR_ID : undefined}
          aria-invalid={queryError !== null}
          value={queryInput}
          onChange={handleChange}
          onFocus={(event) => completion.openMenu(queryInput, event.currentTarget.selectionStart ?? queryInput.length, false)}
          onClick={(event) => completion.openMenu(queryInput, event.currentTarget.selectionStart ?? queryInput.length, false)}
          onSelect={(event) => completion.setCursor(event.currentTarget.selectionStart ?? queryInput.length)}
          onKeyDown={completion.handleKeyDown}
          placeholder="查询日志..."
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className={cn(
            "h-7 w-full rounded-md border bg-secondary py-1 pl-8 pr-8 font-mono text-xs outline-none focus:ring-1 focus:ring-ring",
            queryError ? "border-destructive" : "border-border",
          )}
        />
        {queryInput && (
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setQueryInput("");
              completion.openMenu("", 0, false);
              completion.focusAt(0);
            }}
            className="absolute right-1 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
            title="清空查询"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {(queryError || packageResolution.packageStatus || packageResolution.loadingPackages) && (
        <div className="mt-1 flex min-w-0 items-center gap-2 text-[11px]">
          {queryError && (
            <span
              id={QUERY_ERROR_ID}
              role="alert"
              className="flex min-w-0 items-center gap-1 text-destructive"
            >
              <AlertCircle className="h-3 w-3 shrink-0" />
              <span className="truncate" title={queryError.message}>
                位置 {queryError.start + 1}: {queryError.message}
              </span>
            </span>
          )}
          {hasStatus && (
            <span
              id={QUERY_STATUS_ID}
              role="status"
              aria-live="polite"
              className="ml-auto max-w-[45%] truncate text-muted-foreground"
              title={packageResolution.packageStatus || "加载应用列表..."}
            >
              {packageResolution.packageStatus}
              {packageResolution.packageStatus && packageResolution.loadingPackages ? " / " : ""}
              {packageResolution.loadingPackages ? "加载应用列表..." : ""}
            </span>
          )}
        </div>
      )}

      {completion.open && (
        <LogcatQuerySuggestions
          completions={completion.completions}
          activeIndex={completion.activeIndex}
          currentPackage={packageResolution.currentPackage}
          onSelect={completion.selectCompletion}
        />
      )}
    </div>
  );
}
