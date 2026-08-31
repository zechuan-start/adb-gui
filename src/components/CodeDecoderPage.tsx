import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ClipboardCopy,
  ClipboardPaste,
  Copy,
  Eraser,
  ExternalLink,
  FileUp,
  ImageIcon,
  Images,
  ScanBarcode,
} from "lucide-react";
import {
  buildCopyAllText,
  MAX_IMAGE_BATCH_SIZE,
  partitionImagePaths,
  summarizeBatch,
  type DecodedBatch,
  type DecodedCode,
  type DecodedImage,
  type DecodeSource,
} from "@/lib/codeDecoder";
import {
  onDragDrop,
  openUrlExternal,
  pickImageFiles,
  readClipboardImage,
  readImageFile,
} from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { blobToImageData } from "@/lib/zxingReader";
import { useCodeDecoderStore } from "@/store/codeDecoder";
import { useFeedbackStore } from "@/store/feedback";

type DragState = "idle" | "valid" | "invalid";

const EMPTY_IMAGES: readonly DecodedImage[] = [];

export function CodeDecoderPage() {
  const batch = useCodeDecoderStore((state) => state.batch);
  const progress = useCodeDecoderStore((state) => state.progress);
  const decodeSources = useCodeDecoderStore((state) => state.decodeSources);
  const clear = useCodeDecoderStore((state) => state.clear);
  const showToast = useFeedbackStore((state) => state.showToast);
  const [dragState, setDragState] = useState<DragState>("idle");
  const pastePendingRef = useRef(false);
  const busy = progress !== null;

  const submitPaths = useCallback(
    (paths: readonly string[]) => {
      if (useCodeDecoderStore.getState().progress !== null) {
        showToast("error", "正在解码图片, 请稍候");
        return;
      }

      const { accepted, rejectedCount, truncatedCount } = partitionImagePaths(paths);
      const notices: string[] = [];
      if (rejectedCount > 0) {
        notices.push(`已忽略 ${rejectedCount} 个不支持的文件`);
      }
      if (truncatedCount > 0) {
        notices.push(
          `单次最多解码 ${MAX_IMAGE_BATCH_SIZE} 张图片, 已截断 ${truncatedCount} 张`,
        );
      }
      if (notices.length > 0) {
        showToast("error", notices.join(", "));
      }
      if (accepted.length === 0) {
        return;
      }

      const sources = accepted.map(createPathSource);
      void decodeSources(sources).catch((error) => {
        showToast("error", `解码任务失败: ${String(error)}`);
      });
    },
    [decodeSources, showToast],
  );

  const handlePick = useCallback(async () => {
    try {
      const paths = await pickImageFiles();
      if (paths.length > 0) {
        submitPaths(paths);
      }
    } catch (error) {
      showToast("error", `选择图片失败: ${String(error)}`);
    }
  }, [showToast, submitPaths]);

  const handlePaste = useCallback(async () => {
    if (pastePendingRef.current) {
      return;
    }
    if (useCodeDecoderStore.getState().progress !== null) {
      showToast("error", "正在解码图片, 请稍候");
      return;
    }

    pastePendingRef.current = true;
    try {
      const imageData = await readClipboardImage();
      if (!imageData) {
        showToast("error", "剪贴板中没有图片");
        return;
      }
      if (useCodeDecoderStore.getState().progress !== null) {
        showToast("error", "正在解码图片, 请稍候");
        return;
      }
      await decodeSources([
        {
          name: "剪贴板图片",
          path: null,
          loadInput: async () => imageData,
        },
      ]);
    } catch (error) {
      showToast("error", `读取剪贴板图片失败: ${String(error)}`);
    } finally {
      pastePendingRef.current = false;
    }
  }, [decodeSources, showToast]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    void onDragDrop((event) => {
      if (event.type === "enter") {
        setDragState(
          partitionImagePaths(event.paths).accepted.length > 0 ? "valid" : "invalid",
        );
      } else if (event.type === "drop") {
        setDragState("idle");
        submitPaths(event.paths);
      } else if (event.type === "leave") {
        setDragState("idle");
      }
    })
      .then((nextUnlisten) => {
        if (disposed) {
          nextUnlisten();
          return;
        }
        unlisten = nextUnlisten;
      })
      .catch((error) => {
        if (!disposed) {
          showToast("error", `拖拽监听启动失败: ${String(error)}`);
        }
      });

    return () => {
      disposed = true;
      unlisten?.();
      unlisten = null;
    };
  }, [showToast, submitPaths]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.repeat ||
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== "v" ||
        isEditableTarget(event.target)
      ) {
        return;
      }
      event.preventDefault();
      void handlePaste();
    }

    function handleDomPaste(event: ClipboardEvent) {
      if (isEditableTarget(event.target)) {
        return;
      }
      event.preventDefault();
      void handlePaste();
    }

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("paste", handleDomPaste);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("paste", handleDomPaste);
    };
  }, [handlePaste]);

  const dropHint = busy
    ? "正在逐张解码"
    : dragState === "valid"
      ? "释放以解码图片"
      : dragState === "invalid"
        ? "仅支持 PNG、JPEG、GIF、BMP 和 WebP"
        : "拖拽图片到此处";

  return (
    <section className="grid h-full min-h-0 grid-cols-1 grid-rows-[minmax(360px,55%)_minmax(0,1fr)] min-[900px]:grid-cols-[320px_minmax(0,1fr)] min-[900px]:grid-rows-1">
      <div className="flex min-h-0 flex-col border-b border-border bg-card p-4 min-[900px]:border-r min-[900px]:border-b-0">
        <div className="flex items-center gap-2">
          <ScanBarcode className="h-4 w-4" />
          <h2 className="text-sm font-semibold">图片解码</h2>
        </div>

        <div
          className={cn(
            "mt-4 flex min-h-40 flex-1 items-center justify-center rounded-md border border-dashed px-4 text-center transition-colors",
            dragState === "valid" && "border-primary bg-primary/5",
            dragState === "invalid" && "border-destructive bg-destructive/5",
            dragState === "idle" && "border-border bg-secondary/30",
          )}
        >
          <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
            <Images className="h-8 w-8" />
            <span>{dropHint}</span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void handlePick()}
            disabled={busy}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileUp className="h-4 w-4" />
            选择图片
          </button>
          <button
            type="button"
            onClick={() => void handlePaste()}
            disabled={busy}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-secondary px-3 text-sm font-medium transition-colors hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ClipboardPaste className="h-4 w-4" />
            粘贴图片
          </button>
        </div>

        <div className="mt-3 flex min-h-8 items-center text-xs text-muted-foreground">
          {progress
            ? `正在解码 ${progress.done} / ${progress.total}`
            : batch
              ? `最近批次 ${batch.images.length} 张图片`
              : "等待图片"}
        </div>

        <button
          type="button"
          onClick={() => {
            clear();
            setDragState("idle");
          }}
          disabled={!batch && !progress}
          title="清空"
          aria-label="清空解码结果"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Eraser className="h-4 w-4" />
        </button>
      </div>

      <DecoderResultsPanel batch={batch} progressTotal={progress?.total ?? null} />
    </section>
  );
}

interface DecoderResultsPanelProps {
  batch: DecodedBatch | null;
  progressTotal: number | null;
}

function DecoderResultsPanel({ batch, progressTotal }: DecoderResultsPanelProps) {
  const showToast = useFeedbackStore((state) => state.showToast);
  const scrollRef = useRef<HTMLDivElement>(null);
  const images = batch?.images ?? EMPTY_IMAGES;
  const batchId = batch?.id ?? 0;
  const summary = useMemo(
    () =>
      batch
        ? summarizeBatch(batch)
        : { imageCount: 0, decodedImageCount: 0, codeCount: 0 },
    [batch],
  );
  const getItemKey = useCallback(
    (index: number) => `${batchId}:${images[index]?.id ?? index}`,
    [batchId, images],
  );
  const virtualizer = useVirtualizer({
    count: images.length,
    getScrollElement: () => scrollRef.current,
    getItemKey,
    estimateSize: () => 210,
    overscan: 2,
    useFlushSync: false,
  });

  useEffect(() => {
    if (batchId === 0) {
      return;
    }
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
    virtualizer.measure();
  }, [batchId, virtualizer]);

  const copyText = useCallback(
    async (text: string, message: string) => {
      try {
        await navigator.clipboard.writeText(text);
        showToast("success", message);
      } catch (error) {
        showToast("error", `复制失败: ${String(error)}`);
      }
    },
    [showToast],
  );

  const openUrl = useCallback(
    async (url: string) => {
      try {
        await openUrlExternal(url);
      } catch (error) {
        showToast("error", `打开链接失败: ${String(error)}`);
      }
    },
    [showToast],
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-col bg-background">
      <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2">
        <h2 className="text-sm font-semibold">结果</h2>
        {batch && (
          <span className="text-xs text-muted-foreground">
            {progressTotal ?? summary.imageCount} 张图, {summary.decodedImageCount} 张识别成功,
            {" "}
            {summary.codeCount} 个码
          </span>
        )}
        <button
          type="button"
          onClick={() => {
            if (batch) {
              void copyText(buildCopyAllText(batch), "已复制全部解码结果");
            }
          }}
          disabled={!batch || summary.codeCount === 0}
          title="复制全部"
          className="ml-auto inline-flex h-8 items-center justify-center gap-2 rounded-md bg-secondary px-3 text-xs transition-colors hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ClipboardCopy className="h-4 w-4" />
          复制全部
        </button>
      </div>

      {batch ? (
        images.length > 0 ? (
          <div
            ref={scrollRef}
            role="region"
            aria-label="解码结果列表"
            tabIndex={0}
            className="min-h-0 flex-1 overflow-auto p-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const image = images[virtualItem.index];
                if (!image) {
                  return null;
                }
                return (
                  <div
                    key={virtualItem.key}
                    ref={virtualizer.measureElement}
                    data-index={virtualItem.index}
                    className="absolute top-0 left-0 w-full pb-3"
                    style={{ transform: `translateY(${virtualItem.start}px)` }}
                  >
                    <DecodedImageCard image={image} copyText={copyText} openUrl={openUrl} />
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
            <ScanBarcode className="h-8 w-8" />
            <span className="text-sm">等待首张图片完成</span>
          </div>
        )
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <ImageIcon className="h-8 w-8" />
          <span className="text-sm">暂无解码结果</span>
        </div>
      )}
    </div>
  );
}

interface DecodedImageCardProps {
  image: DecodedImage;
  copyText: (text: string, message: string) => Promise<void>;
  openUrl: (url: string) => Promise<void>;
}

function DecodedImageCard({ image, copyText, openUrl }: DecodedImageCardProps) {
  return (
    <article className="overflow-hidden rounded-md border border-border bg-card">
      <header className="flex min-w-0 items-center gap-3 border-b border-border px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium" title={image.name}>
          {image.name}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {image.error ? "失败" : `${image.codes.length} 个码`}
        </span>
      </header>
      <div className="grid min-w-0 grid-cols-[96px_minmax(0,1fr)] gap-3 p-3">
        <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-md border border-border bg-white">
          {image.thumbnail ? (
            <img
              src={image.thumbnail}
              alt=""
              className="h-full w-full object-contain"
              draggable={false}
            />
          ) : (
            <ImageIcon className="h-6 w-6 text-muted-foreground" />
          )}
        </div>

        <div className="min-w-0">
          {image.error ? (
            <div className="break-words text-sm text-destructive">解码失败: {image.error}</div>
          ) : image.codes.length === 0 ? (
            <div className="text-sm text-muted-foreground">未识别到码</div>
          ) : (
            <div className="divide-y divide-border">
              {image.codes.map((code, index) => (
                <DecodedCodeRow
                  key={`${image.id}:${index}`}
                  code={code}
                  copyText={copyText}
                  openUrl={openUrl}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

interface DecodedCodeRowProps {
  code: DecodedCode;
  copyText: (text: string, message: string) => Promise<void>;
  openUrl: (url: string) => Promise<void>;
}

function DecodedCodeRow({ code, copyText, openUrl }: DecodedCodeRowProps) {
  return (
    <div className="flex min-w-0 items-start gap-2 py-2 first:pt-0 last:pb-0">
      <span className="shrink-0 rounded-md bg-secondary px-2 py-1 font-mono text-[11px] text-muted-foreground">
        {code.format}
      </span>
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-xs leading-5">
        {code.text}
      </span>
      <button
        type="button"
        onClick={() => void copyText(code.text, "已复制解码内容")}
        title="复制"
        aria-label="复制解码内容"
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
      {code.isUrl && (
        <button
          type="button"
          onClick={() => void openUrl(code.text.trim())}
          title="在浏览器中打开"
          aria-label="在浏览器中打开链接"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function createPathSource(path: string): DecodeSource {
  return {
    name: path.split(/[\\/]/).pop() || path,
    path,
    loadInput: async () => {
      const bytes = await readImageFile(path);
      return blobToImageData(new Blob([bytes]));
    },
  };
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}
