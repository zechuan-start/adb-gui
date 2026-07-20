import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ChevronLeft,
  ChevronRight,
  Eraser,
  QrCode,
  ScanLine,
  X,
} from "lucide-react";
import { GeneratedCodeCanvas } from "@/components/GeneratedCodeCanvas";
import {
  DEFAULT_GENERATOR_DRAFT,
  SEPARATOR_OPTIONS,
  isSeparatorMode,
  type GeneratedBatch,
} from "@/lib/codeGenerator";
import { cn } from "@/lib/utils";
import { useCodeGeneratorStore } from "@/store/codeGenerator";

const EMPTY_VALUES: readonly string[] = [];

export function CodeGeneratorPage() {
  const draft = useCodeGeneratorStore((state) => state.draft);
  const draftRevision = useCodeGeneratorStore((state) => state.draftRevision);
  const generatedBatch = useCodeGeneratorStore((state) => state.generatedBatch);
  const inputError = useCodeGeneratorStore((state) => state.inputError);
  const setCodeType = useCodeGeneratorStore((state) => state.setCodeType);
  const setSeparatorMode = useCodeGeneratorStore((state) => state.setSeparatorMode);
  const setCustomSeparator = useCodeGeneratorStore((state) => state.setCustomSeparator);
  const setInput = useCodeGeneratorStore((state) => state.setInput);
  const generate = useCodeGeneratorStore((state) => state.generate);
  const clear = useCodeGeneratorStore((state) => state.clear);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const previewTriggerRef = useRef<HTMLButtonElement | null>(null);

  const isStale = Boolean(
    generatedBatch && generatedBatch.sourceRevision !== draftRevision,
  );
  const canClear = Boolean(
    generatedBatch ||
      draft.input ||
      draft.customSeparator ||
      draft.codeType !== DEFAULT_GENERATOR_DRAFT.codeType ||
      draft.separatorMode !== DEFAULT_GENERATOR_DRAFT.separatorMode,
  );
  const customSeparatorError =
    inputError &&
    draft.input.length > 0 &&
    draft.separatorMode === "custom" &&
    draft.customSeparator.length === 0
      ? inputError
      : "";
  const dataError = customSeparatorError ? "" : inputError;

  function handleGenerate() {
    if (generate()) {
      setPreviewIndex(null);
      previewTriggerRef.current = null;
    }
  }

  function handlePanelKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      handleGenerate();
    }
  }

  function handlePreview(index: number, trigger: HTMLButtonElement) {
    previewTriggerRef.current = trigger;
    setPreviewIndex(index);
  }

  function handleClosePreview() {
    const trigger = previewTriggerRef.current;
    setPreviewIndex(null);
    trigger?.focus();
  }

  return (
    <section className="grid h-full min-h-0 grid-cols-1 grid-rows-[minmax(360px,55%)_minmax(0,1fr)] min-[900px]:grid-cols-[320px_minmax(0,1fr)] min-[900px]:grid-rows-1">
      <div
        onKeyDown={handlePanelKeyDown}
        className="flex min-h-0 flex-col border-b border-border bg-card p-4 min-[900px]:border-r min-[900px]:border-b-0"
      >
        <div className="grid grid-cols-2 rounded-lg border border-border bg-secondary/60 p-1">
          <button
            type="button"
            onClick={() => setCodeType("qr")}
            aria-pressed={draft.codeType === "qr"}
            className={cn(
              "inline-flex h-8 items-center justify-center gap-2 rounded-md text-sm transition-colors",
              draft.codeType === "qr"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <QrCode className="h-4 w-4" />
            二维码
          </button>
          <button
            type="button"
            onClick={() => setCodeType("code128")}
            aria-pressed={draft.codeType === "code128"}
            className={cn(
              "inline-flex h-8 items-center justify-center gap-2 rounded-md text-sm transition-colors",
              draft.codeType === "code128"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <ScanLine className="h-4 w-4" />
            条形码
          </button>
        </div>

        <label className="mt-4 text-xs font-medium text-muted-foreground" htmlFor="code-separator">
          分隔符
        </label>
        <select
          id="code-separator"
          value={draft.separatorMode}
          onChange={(event) => {
            if (isSeparatorMode(event.target.value)) {
              setSeparatorMode(event.target.value);
            }
          }}
          className="mt-1 h-9 rounded-md border border-border bg-secondary px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
        >
          {SEPARATOR_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {draft.separatorMode === "custom" && (
          <div className="mt-2">
            <input
              type="text"
              value={draft.customSeparator}
              onChange={(event) => setCustomSeparator(event.target.value)}
              placeholder="输入自定义分隔符"
              aria-label="自定义分隔符"
              aria-invalid={Boolean(customSeparatorError)}
              className="h-9 w-full rounded-md border border-border bg-secondary px-3 font-mono text-sm outline-none focus:ring-1 focus:ring-ring"
            />
            {customSeparatorError && (
              <div className="pt-1 text-xs text-destructive">{customSeparatorError}</div>
            )}
          </div>
        )}

        <label className="mt-4 text-xs font-medium text-muted-foreground" htmlFor="code-input">
          数据
        </label>
        <textarea
          id="code-input"
          value={draft.input}
          onChange={(event) => setInput(event.target.value)}
          aria-invalid={Boolean(dataError)}
          spellCheck={false}
          placeholder={"https://example.com\nADB-GUI-001"}
          className="mt-1 min-h-28 flex-1 resize-none rounded-md border border-border bg-secondary p-3 font-mono text-sm leading-5 outline-none focus:ring-1 focus:ring-ring"
        />

        <div className="min-h-7 pt-2 text-xs text-destructive">{dataError}</div>

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              clear();
              setPreviewIndex(null);
              previewTriggerRef.current = null;
            }}
            disabled={!canClear}
            title="清空"
            aria-label="清空输入和结果"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Eraser className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            title="生成 (Ctrl/Command+Enter)"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <QrCode className="h-4 w-4" />
            生成
          </button>
        </div>
      </div>

      <CodeResultsPanel
        batch={generatedBatch}
        isStale={isStale}
        onPreview={handlePreview}
      />

      {generatedBatch && previewIndex !== null && (
        <CodePreviewDialog
          batch={generatedBatch}
          index={previewIndex}
          onIndexChange={setPreviewIndex}
          onClose={handleClosePreview}
        />
      )}
    </section>
  );
}

interface CodeResultsPanelProps {
  batch: GeneratedBatch | null;
  isStale: boolean;
  onPreview: (index: number, trigger: HTMLButtonElement) => void;
}

function CodeResultsPanel({ batch, isStale, onPreview }: CodeResultsPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const values = batch?.values ?? EMPTY_VALUES;
  const columnCount = batch?.codeType === "qr" ? 2 : 1;
  const rowCount = Math.ceil(values.length / columnCount);
  const batchId = batch?.id ?? 0;
  const estimateSize = batch?.codeType === "qr" ? 240 : 176;
  const getItemKey = useCallback(
    (rowIndex: number) => `${batchId}:${rowIndex}`,
    [batchId],
  );
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    getItemKey,
    estimateSize: () => estimateSize,
    overscan: 2,
    useFlushSync: false,
  });

  useEffect(() => {
    if (!batch) {
      return;
    }
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
    virtualizer.measure();
  }, [batchId, batch, virtualizer]);

  const virtualRows = virtualizer.getVirtualItems();

  return (
    <div className="flex min-h-0 min-w-0 flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <h2 className="text-sm font-semibold">结果</h2>
        {batch && (
          <>
            <span className="text-xs text-muted-foreground">
              {values.length.toLocaleString("zh-CN")} 项
            </span>
            <span className="rounded-md bg-secondary px-2 py-1 text-[11px] text-muted-foreground">
              {batch.codeType === "qr" ? "二维码" : "Code 128"}
            </span>
          </>
        )}
        {isStale && (
          <span className="ml-auto text-xs text-amber-700 dark:text-amber-300">
            输入已修改
          </span>
        )}
      </div>

      {batch ? (
        <div
          ref={scrollRef}
          role="region"
          aria-label="生成结果列表"
          tabIndex={0}
          className="min-h-0 flex-1 overflow-auto p-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <div
            className="relative w-full"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualRows.map((virtualRow) => (
              <div
                key={virtualRow.key}
                className={cn(
                  "absolute top-0 left-0 grid w-full gap-3 pb-3",
                  columnCount === 2 ? "grid-cols-2" : "grid-cols-1",
                )}
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {Array.from({ length: columnCount }, (_, offset) => {
                  const itemIndex = virtualRow.index * columnCount + offset;
                  const value = values[itemIndex];
                  if (value === undefined) {
                    return null;
                  }
                  return (
                    <CodeResultCard
                      key={`${batch.id}:${itemIndex}`}
                      batch={batch}
                      index={itemIndex}
                      value={value}
                      onPreview={onPreview}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <QrCode className="h-8 w-8" />
          <span className="text-sm">暂无结果</span>
        </div>
      )}
    </div>
  );
}

interface CodeResultCardProps {
  batch: GeneratedBatch;
  index: number;
  value: string;
  onPreview: (index: number, trigger: HTMLButtonElement) => void;
}

function CodeResultCard({ batch, index, value, onPreview }: CodeResultCardProps) {
  const displayValue = getDisplayValue(value);

  return (
    <button
      type="button"
      onClick={(event) => onPreview(index, event.currentTarget)}
      className="flex h-full min-w-0 flex-col overflow-hidden rounded-md border border-border bg-card text-left transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`放大预览第 ${index + 1} 项`}
    >
      <GeneratedCodeCanvas codeType={batch.codeType} value={value} />
      <div className="flex min-w-0 flex-1 items-start gap-2 border-t border-border px-3 py-2">
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
          {index + 1}
        </span>
        <span
          className="max-h-10 min-w-0 flex-1 overflow-hidden whitespace-pre-wrap break-all font-mono text-xs leading-5"
          title={value}
        >
          {displayValue}
        </span>
      </div>
    </button>
  );
}

interface CodePreviewDialogProps {
  batch: GeneratedBatch;
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

function CodePreviewDialog({
  batch,
  index,
  onIndexChange,
  onClose,
}: CodePreviewDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const value = batch.values[index];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }, []);

  if (value === undefined) {
    return null;
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDialogElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDialog();
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (index > 0) {
        onIndexChange(index - 1);
      }
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      if (index < batch.values.length - 1) {
        onIndexChange(index + 1);
      }
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
      onKeyDown={handleKeyDown}
      aria-label="码图放大预览"
      className="m-auto max-h-[90vh] w-[min(760px,92vw)] overflow-hidden rounded-lg border border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/60"
    >
      <div className="flex max-h-[90vh] min-h-0 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
          <span className="text-sm font-semibold">
            {batch.codeType === "qr" ? "二维码" : "Code 128"}
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            {index + 1} / {batch.values.length}
          </span>
          <button
            type="button"
            onClick={closeDialog}
            title="关闭"
            aria-label="关闭预览"
            className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-white p-4">
          <GeneratedCodeCanvas codeType={batch.codeType} value={value} variant="preview" />
        </div>

        <div className="max-h-28 overflow-auto border-t border-border bg-card px-4 py-3">
          <div className="whitespace-pre-wrap break-all font-mono text-xs leading-5">
            {getDisplayValue(value)}
          </div>
        </div>

        <div className="flex h-14 shrink-0 items-center justify-center gap-3 border-t border-border bg-card px-4">
          <button
            type="button"
            onClick={() => onIndexChange(index - 1)}
            disabled={index === 0}
            title="上一项"
            aria-label="上一项"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onIndexChange(index + 1)}
            disabled={index === batch.values.length - 1}
            title="下一项"
            aria-label="下一项"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </dialog>
  );
}

function getDisplayValue(value: string): string {
  if (value.trim().length === 0) {
    return `空白字符 (${value.length})`;
  }
  return value;
}
