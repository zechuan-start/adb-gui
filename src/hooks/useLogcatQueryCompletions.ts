import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import type { LogcatPackageResolutionState } from "@/hooks/useLogcatPackageResolution";
import {
  applyQueryCompletion,
  getQueryCompletions,
  getQueryValueKeyAtCursor,
  type QueryCompletion,
} from "@/lib/logcatQueryCompletion";
import type { LogcatRingBuffer } from "@/lib/logcat";
import { useLogcatStore } from "@/store/logcat";

const TAG_COMPLETION_LIMIT = 200;

interface UseLogcatQueryCompletionsOptions {
  queryInput: string;
  setQueryInput: (value: string) => void;
  packageResolution: LogcatPackageResolutionState;
}

interface LogcatQueryCompletionController {
  inputRef: RefObject<HTMLInputElement | null>;
  open: boolean;
  completions: QueryCompletion[];
  activeIndex: number;
  openMenu: (input: string, cursor: number, forceRefresh: boolean) => void;
  closeMenu: () => void;
  selectCompletion: (completion: QueryCompletion) => void;
  setCursor: (cursor: number) => void;
  handleKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  focusAt: (cursor: number) => void;
}

function currentBufferKey(): string {
  const { buffer, nextSeq } = useLogcatStore.getState();
  return `${buffer.count}:${buffer.oldestSeq}:${nextSeq}`;
}

export function sampleRecentLogcatTags(buffer: LogcatRingBuffer): string[] {
  const tags = new Set<string>();
  for (let index = buffer.count - 1; index >= 0; index -= 1) {
    const tag = buffer.at(index)?.tag;
    if (tag) {
      tags.add(tag);
      if (tags.size >= TAG_COMPLETION_LIMIT) {
        break;
      }
    }
  }
  return Array.from(tags).sort();
}

export function useLogcatQueryCompletions({
  queryInput,
  setQueryInput,
  packageResolution,
}: UseLogcatQueryCompletionsOptions): LogcatQueryCompletionController {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(queryInput.length);
  const [activeIndex, setActiveIndex] = useState(0);
  const [tagOptions, setTagOptions] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const focusFrameRef = useRef<number | null>(null);
  const sampledBufferKeyRef = useRef<string | null>(null);

  useEffect(() => () => {
    if (focusFrameRef.current !== null) {
      window.cancelAnimationFrame(focusFrameRef.current);
    }
  }, []);

  const completions = useMemo(
    () => open
      ? getQueryCompletions(queryInput, cursor, {
          tags: tagOptions,
          packages: packageResolution.packageOptions,
          processes: packageResolution.processOptions,
        })
      : [],
    [
      cursor,
      open,
      packageResolution.packageOptions,
      packageResolution.processOptions,
      queryInput,
      tagOptions,
    ],
  );
  const visibleActiveIndex = completions.length === 0
    ? 0
    : Math.min(activeIndex, completions.length - 1);

  useEffect(() => {
    setActiveIndex((index) =>
      completions.length === 0 ? 0 : Math.min(index, completions.length - 1),
    );
  }, [completions.length]);

  function refreshTagOptions(input: string, nextCursor: number, forceRefresh: boolean): void {
    if (getQueryValueKeyAtCursor(input, nextCursor) !== "tag") {
      return;
    }
    const bufferKey = currentBufferKey();
    if (!forceRefresh && sampledBufferKeyRef.current === bufferKey) {
      return;
    }
    sampledBufferKeyRef.current = bufferKey;
    setTagOptions(sampleRecentLogcatTags(useLogcatStore.getState().buffer));
  }

  function openMenu(input: string, nextCursor: number, forceRefresh: boolean): void {
    refreshTagOptions(input, nextCursor, forceRefresh);
    setCursor(nextCursor);
    setActiveIndex(0);
    setOpen(true);
    if (getQueryValueKeyAtCursor(input, nextCursor) === "package") {
      void packageResolution.loadPackageOptions();
    }
  }

  function focusAt(nextCursor: number): void {
    if (focusFrameRef.current !== null) {
      window.cancelAnimationFrame(focusFrameRef.current);
    }
    focusFrameRef.current = window.requestAnimationFrame(() => {
      focusFrameRef.current = null;
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  }

  function selectCompletion(completion: QueryCompletion): void {
    const applied = applyQueryCompletion(queryInput, completion);
    setQueryInput(applied.input);
    setCursor(applied.cursor);
    setActiveIndex(0);
    const keepOpen = completion.kind === "key" || completion.kind === "operator";
    setOpen(keepOpen);
    if (keepOpen) {
      refreshTagOptions(applied.input, applied.cursor, false);
    }
    if (completion.kind === "key" && completion.insertText === "package:") {
      void packageResolution.loadPackageOptions();
    }
    focusAt(applied.cursor);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if ((event.ctrlKey || event.metaKey) && event.key === " ") {
      event.preventDefault();
      openMenu(queryInput, event.currentTarget.selectionStart ?? queryInput.length, true);
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (!open || completions.length === 0) {
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((index) =>
        (index + direction + completions.length) % completions.length,
      );
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      selectCompletion(completions[visibleActiveIndex]);
    }
  }

  return {
    inputRef,
    open,
    completions,
    activeIndex: visibleActiveIndex,
    openMenu,
    closeMenu: () => setOpen(false),
    selectCompletion,
    setCursor,
    handleKeyDown,
    focusAt,
  };
}
