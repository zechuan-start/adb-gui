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
import { BlueprintSelect } from "@/components/BlueprintSelect";
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
    <section className="grid h-full min-h-0 grid-cols-1 grid-rows-[minmax(336px,52%)_minmax(0,1fr)] min-[900px]:grid-cols-[300px_minmax(0,1fr)] min-[900px]:grid-rows-1">
      <div
        onKeyDown={handlePanelKeyDown}
        className="min-h-0 overflow-y-auto border-b border-rule p-[18px] min-[900px]:border-r min-[900px]:border-b-0"
      >
        <section className="border border-rule bg-surface2">
          <header className="flex h-10 items-center gap-2 border-b border-rule px-3">
            <QrCode className="h-4 w-4 text-ink2" />
            <h2 className="text-sm font-semibold text-ink">批量生码</h2>
            <span className="ml-auto font-data text-[10px] text-note">C-01</span>
          </header>
          <div className="p-3">
            <div className="grid grid-cols-2 border border-rule">
              <button
                type="button"
                onClick={() => setCodeType("qr")}
                aria-pressed={draft.codeType === "qr"}
                className={cn(
                  "inline-flex h-8 items-center justify-center gap-2 border-r border-rule font-data text-[11px] last:border-r-0",
                  draft.codeType === "qr"
                    ? "bg-ink text-onink"
                    : "text-ink2 hover:bg-hover hover:text-ink",
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
                  "inline-flex h-8 items-center justify-center gap-2 border-r border-rule font-data text-[11px] last:border-r-0",
                  draft.codeType === "code128"
                    ? "bg-ink text-onink"
                    : "text-ink2 hover:bg-hover hover:text-ink",
                )}
              >
                <ScanLine className="h-4 w-4" />
                条形码
              </button>
            </div>

            <label
              className="mt-3 block font-data text-[10.5px] text-ink3"
              htmlFor="code-separator"
            >
              分隔符
            </label>
            <BlueprintSelect
              id="code-separator"
              value={draft.separatorMode}
              options={SEPARATOR_OPTIONS}
              onValueChange={(nextValue) => {
                if (isSeparatorMode(nextValue)) {
                  setSeparatorMode(nextValue);
                }
              }}
              ariaLabel="分隔符"
              containerClassName="mt-1"
            />

            {draft.separatorMode === "custom" && (
              <div className="mt-2">
                <input
                  type="text"
                  value={draft.customSeparator}
                  onChange={(event) => setCustomSeparator(event.target.value)}
                  placeholder="输入自定义分隔符"
                  aria-label="自定义分隔符"
                  aria-invalid={Boolean(customSeparatorError)}
                  className="h-8 w-full border border-rule bg-paper px-2.5 font-data text-[11.5px] text-ink outline-none placeholder:text-ink3"
                />
                {customSeparatorError && (
                  <div className="pt-1 text-[11px] text-err">{customSeparatorError}</div>
                )}
              </div>
            )}

            <label
              className="mt-3 block font-data text-[10.5px] text-ink3"
              htmlFor="code-input"
            >
              数据
            </label>
            <textarea
              id="code-input"
              value={draft.input}
              onChange={(event) => setInput(event.target.value)}
              aria-invalid={Boolean(dataError)}
              spellCheck={false}
              placeholder={"https://example.com\nADB-GUI-001"}
              className="mt-1 h-36 min-h-28 w-full resize-y border border-rule bg-paper p-2.5 font-data text-[11.5px] leading-5 text-ink outline-none placeholder:text-ink3"
            />

            <div className="min-h-6 pt-1.5 text-[11px] text-err">{dataError}</div>

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
                className="inline-flex h-8 w-8 items-center justify-center border border-rule text-ink2 hover:border-ink3 hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Eraser className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                title="生成 (Ctrl/Command+Enter)"
                className="inline-flex h-8 flex-1 items-center justify-center gap-2 border border-ink bg-ink px-4 font-data text-[11px] font-medium text-onink hover:bg-ink2"
              >
                <QrCode className="h-4 w-4" />
                生成
              </button>
            </div>
          </div>
        </section>
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
    <div className="flex min-h-0 min-w-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-rule bg-surface px-4">
        <h2 className="text-sm font-semibold text-ink">结果</h2>
        {batch && (
          <>
            <span className="font-data text-[10.5px] text-ink3">
              {values.length.toLocaleString("zh-CN")} 项
            </span>
            <span className="border border-rule px-2 py-0.5 font-data text-[10px] text-ink2">
              {batch.codeType === "qr" ? "二维码" : "Code 128"}
            </span>
          </>
        )}
        {isStale && (
          <span className="ml-auto text-xs text-warn">
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
          className="min-h-0 flex-1 overflow-auto p-[18px] outline-none"
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
        <div className="m-[18px] flex min-h-36 flex-1 flex-col items-center justify-center gap-2 border border-dashed border-rule bg-surface px-5 text-center text-ink3">
          <QrCode className="h-6 w-6" />
          <strong className="text-sm font-semibold text-ink">还没有生成任何码</strong>
          <span className="text-xs">在左侧输入数据并生成.</span>
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
      className="flex h-full min-w-0 flex-col overflow-hidden border border-rule bg-surface2 text-left hover:border-note"
      aria-label={`放大预览第 ${index + 1} 项`}
    >
      <GeneratedCodeCanvas codeType={batch.codeType} value={value} />
      <div className="flex min-w-0 flex-1 items-start gap-2 border-t border-rule px-3 py-2">
        <span className="shrink-0 font-data text-[11px] text-ink3">
          {index + 1}
        </span>
        <span
          className="max-h-10 min-w-0 flex-1 overflow-hidden whitespace-pre-wrap break-all font-data text-xs leading-5 text-ink"
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
      className="m-auto max-h-[90vh] w-[min(760px,92vw)] overflow-hidden border border-rule bg-paper p-0 text-ink shadow-[3px_3px_0_var(--color-hard-shadow)] backdrop:bg-black/60"
    >
      <div className="flex max-h-[90vh] min-h-0 flex-col">
        <div className="flex h-10 shrink-0 items-center gap-3 border-b border-rule bg-surface px-4">
          <span className="text-sm font-semibold">
            {batch.codeType === "qr" ? "二维码" : "Code 128"}
          </span>
          <span className="font-data text-xs text-ink3">
            {index + 1} / {batch.values.length}
          </span>
          <button
            type="button"
            onClick={closeDialog}
            title="关闭"
            aria-label="关闭预览"
            className="ml-auto inline-flex h-8 w-8 items-center justify-center text-ink3 hover:bg-hover hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-white p-4">
          <GeneratedCodeCanvas codeType={batch.codeType} value={value} variant="preview" />
        </div>

        <div className="max-h-28 overflow-auto border-t border-rule bg-surface2 px-4 py-3">
          <div className="whitespace-pre-wrap break-all font-data text-xs leading-5">
            {getDisplayValue(value)}
          </div>
        </div>

        <div className="flex h-12 shrink-0 items-center justify-center gap-3 border-t border-rule bg-surface px-4">
          <button
            type="button"
            onClick={() => onIndexChange(index - 1)}
            disabled={index === 0}
            title="上一项"
            aria-label="上一项"
            className="inline-flex h-8 w-8 items-center justify-center border border-rule text-ink2 hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onIndexChange(index + 1)}
            disabled={index === batch.values.length - 1}
            title="下一项"
            aria-label="下一项"
            className="inline-flex h-8 w-8 items-center justify-center border border-rule text-ink2 hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
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
