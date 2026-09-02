import {
  useEffect,
  useRef,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import { AlertCircle, Search, X } from "lucide-react";
import { useLogcatQueryCompletions } from "@/hooks/useLogcatQueryCompletions";
import type { LogcatPackageResolutionState } from "@/hooks/useLogcatPackageResolution";
import { cn } from "@/lib/utils";
import { useLogcatStore } from "@/store/logcat";
import { useUiStore } from "@/store/ui";
import { LogcatQuerySuggestions } from "@/components/logcat/LogcatQuerySuggestions";

const QUERY_DEBOUNCE_MS = 150;
const QUERY_ERROR_ID = "logcat-query-error";
const QUERY_STATUS_ID = "logcat-query-status";

interface LogcatQueryInputProps {
  visible: boolean;
  packageResolution: LogcatPackageResolutionState;
}

export function LogcatQueryInput({ visible, packageResolution }: LogcatQueryInputProps) {
  const queryInput = useLogcatStore((state) => state.queryInput);
  const queryError = useLogcatStore((state) => state.queryError);
  const setQueryInput = useLogcatStore((state) => state.setQueryInput);
  const commitQuery = useLogcatStore((state) => state.commitQuery);
  const focusNonce = useUiStore((state) => state.logQueryFocusNonce);
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

  useEffect(() => {
    if (!visible || focusNonce === 0) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      const cursor = useLogcatStore.getState().queryInput.length;
      completion.inputRef.current?.focus();
      completion.inputRef.current?.setSelectionRange(cursor, cursor);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusNonce, visible]);

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

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key !== "Escape") {
      completion.handleKeyDown(event);
      return;
    }
    event.preventDefault();
    completion.closeMenu();
    setQueryInput("");
    commitQuery("");
    event.currentTarget.blur();
  }

  return (
    <div ref={rootRef} className="relative min-w-[160px] flex-1" onBlur={handleBlur}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-log-dim" />
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
          onKeyDown={handleKeyDown}
          placeholder="查询日志..."
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className={cn(
            "h-7 w-full border bg-surface py-1 pl-8 pr-8 font-mono text-xs outline-none focus:ring-1 focus:ring-ring",
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
            className="absolute right-1 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center text-log-dim hover:bg-hover hover:text-ink"
            title="清空查询"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {queryError && (
        <>
          <AlertCircle
            className="pointer-events-none absolute right-8 top-2 h-3 w-3 text-err"
            aria-hidden="true"
          />
          <span id={QUERY_ERROR_ID} role="alert" className="sr-only">
            位置 {queryError.start + 1}: {queryError.message}
          </span>
        </>
      )}
      {hasStatus && (
        <span id={QUERY_STATUS_ID} role="status" aria-live="polite" className="sr-only">
          {packageResolution.packageStatus}
          {packageResolution.packageStatus && packageResolution.loadingPackages ? " / " : ""}
          {packageResolution.loadingPackages ? "加载应用列表..." : ""}
        </span>
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
