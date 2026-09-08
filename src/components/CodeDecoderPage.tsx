import { useT, errorText, type Message } from "@/i18n";
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
  isTauriRuntime,
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

interface CodeDecoderPageProps {
  active?: boolean;
}

export function CodeDecoderPage({ active = true }: CodeDecoderPageProps) {
  const t = useT();
  const batch = useCodeDecoderStore((state) => state.batch);
  const progress = useCodeDecoderStore((state) => state.progress);
  const decodeSources = useCodeDecoderStore((state) => state.decodeSources);
  const clear = useCodeDecoderStore((state) => state.clear);
  const showToast = useFeedbackStore((state) => state.showToast);
  const [dragState, setDragState] = useState<DragState>("idle");
  const pastePendingRef = useRef(false);
  const dragListenerEnabledRef = useRef(active);
  const busy = progress !== null;

  dragListenerEnabledRef.current = active;

  const submitPaths = useCallback(
    (paths: readonly string[]) => {
      if (useCodeDecoderStore.getState().progress !== null) {
        showToast("error", (t) => (t.decoder.codeDecoderPage.decodingImagesPleaseWait));
        return;
      }

      const { accepted, rejectedCount, truncatedCount } = partitionImagePaths(paths);
      if (rejectedCount > 0 || truncatedCount > 0) {
        showToast("error", (t) => [
          rejectedCount > 0 ? t.decoder.codeDecoderPage.ignoredUnsupportedFiles({ count: rejectedCount }) : null,
          truncatedCount > 0 ? t.decoder.codeDecoderPage.decodeUpToImagesPerBatchSkipped({ limit: MAX_IMAGE_BATCH_SIZE, skipped: truncatedCount }) : null,
        ].filter(Boolean).join(", "));
      }
      if (accepted.length === 0) {
        return;
      }

      const sources = accepted.map(createPathSource);
      void decodeSources(sources).catch((error) => {
        showToast("error", (t) => (t.decoder.codeDecoderPage.decodingTaskFailed({ detail: errorText(error, t) })));
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
      showToast("error", (t) => (t.decoder.codeDecoderPage.couldNotChooseImages({ detail: errorText(error, t) })));
    }
  }, [showToast, submitPaths]);

  const handlePaste = useCallback(async () => {
    if (pastePendingRef.current) {
      return;
    }
    if (useCodeDecoderStore.getState().progress !== null) {
      showToast("error", (t) => (t.decoder.codeDecoderPage.decodingImagesPleaseWait));
      return;
    }

    pastePendingRef.current = true;
    try {
      const imageData = await readClipboardImage();
      if (!imageData) {
        showToast("error", (t) => (t.decoder.codeDecoderPage.noImageInTheClipboard));
        return;
      }
      if (useCodeDecoderStore.getState().progress !== null) {
        showToast("error", (t) => (t.decoder.codeDecoderPage.decodingImagesPleaseWait));
        return;
      }
      await decodeSources([
        {
          name: "",
          sourceKind: "clipboard",
          path: null,
          loadInput: async () => imageData,
        },
      ]);
    } catch (error) {
      showToast("error", (t) => (t.decoder.codeDecoderPage.couldNotReadClipboardImage({ detail: errorText(error, t) })));
    } finally {
      pastePendingRef.current = false;
    }
  }, [decodeSources, showToast]);

  useEffect(() => {
    if (!active || !isTauriRuntime()) {
      setDragState("idle");
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | null = null;
    void onDragDrop((event) => {
      if (disposed || !dragListenerEnabledRef.current) {
        return;
      }
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
        if (!disposed && dragListenerEnabledRef.current) {
          showToast("error", (t) => (t.decoder.codeDecoderPage.couldNotStartDropListener({ detail: errorText(error, t) })));
        }
      });

    return () => {
      disposed = true;
      unlisten?.();
      unlisten = null;
    };
  }, [active, showToast, submitPaths]);

  useEffect(() => {
    if (!active) {
      return;
    }

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
  }, [active, handlePaste]);

  const dropHint = busy
    ? t.decoder.codeDecoderPage.decodingImagesOneByOne
    : dragState === "valid"
      ? t.decoder.codeDecoderPage.dropToDecodeImages
      : dragState === "invalid"
        ? t.decoder.codeDecoderPage.supportsPNGJPEGGIFBMPAndWebPOnly
        : t.decoder.codeDecoderPage.dropImagesHere;

  return (
    <section className="grid h-full min-h-0 grid-cols-1 grid-rows-[minmax(336px,52%)_minmax(0,1fr)] min-[900px]:grid-cols-[300px_minmax(0,1fr)] min-[900px]:grid-rows-1">
      <div className="min-h-0 overflow-y-auto border-b border-rule p-[18px] min-[900px]:border-r min-[900px]:border-b-0">
        <section className="border border-rule bg-surface2">
          <header className="flex h-10 items-center gap-2 border-b border-rule px-3">
            <ScanBarcode className="h-4 w-4 text-ink2" />
            <h2 className="text-sm font-semibold text-ink">{t.decoder.codeDecoderPage.decodeSource}</h2>
            <span className="ml-auto font-data text-[10px] text-note">D-01</span>
          </header>
          <div className="p-3">
            <div
              className={cn(
                "flex min-h-36 items-center justify-center border border-dashed px-4 text-center",
                dragState === "valid" && "border-note bg-hover",
                dragState === "invalid" && "border-err bg-err-band",
                dragState === "idle" && "border-rule bg-paper/45",
              )}
            >
              <div className="flex flex-col items-center gap-2 text-xs text-ink2">
                <Images className="h-6 w-6 text-ink3" />
                <span className="font-data">{dropHint}</span>
                <span className="text-[10.5px] text-ink3">
                  PNG / JPEG / GIF / BMP / WebP
                </span>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => void handlePick()}
                disabled={busy}
                className="inline-flex h-8 items-center justify-center gap-2 border border-ink bg-ink px-3 font-data text-[11px] font-medium text-onink hover:bg-ink2 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <FileUp className="h-4 w-4" />
                {t.decoder.codeDecoderPage.chooseImages}
              </button>
              <button
                type="button"
                onClick={() => void handlePaste()}
                disabled={busy}
                className="inline-flex h-8 items-center justify-center gap-2 border border-rule px-3 font-data text-[11px] text-ink hover:border-ink3 hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ClipboardPaste className="h-4 w-4" />
                {t.decoder.codeDecoderPage.pasteImage}
              </button>
            </div>

            <div className="mt-3 flex min-h-6 items-center border-t border-dashed border-rule2 pt-2 font-data text-[10.5px] text-ink3">
              {progress
                ? t.decoder.codeDecoderPage.decoding({ done: progress.done, total: progress.total })
                : batch
                  ? t.decoder.codeDecoderPage.latestBatchImages({ count: batch.images.length })
                  : t.decoder.codeDecoderPage.waitingForImages}
            </div>

            <button
              type="button"
              onClick={() => {
                clear();
                setDragState("idle");
              }}
              disabled={!batch && !progress}
              title={t.decoder.codeDecoderPage.clear}
              aria-label={t.decoder.codeDecoderPage.clearDecodedResults}
              className="mt-2 inline-flex h-8 w-8 items-center justify-center border border-rule text-ink2 hover:border-ink3 hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Eraser className="h-4 w-4" />
            </button>
          </div>
        </section>
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
  const t = useT();
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
    async (text: string, message: Message) => {
      try {
        await navigator.clipboard.writeText(text);
        showToast("success", message);
      } catch (error) {
        showToast("error", (t) => (t.decoder.codeDecoderPage.copyFailed({ detail: errorText(error, t) })));
      }
    },
    [showToast],
  );

  const openUrl = useCallback(
    async (url: string) => {
      try {
        await openUrlExternal(url);
      } catch (error) {
        showToast("error", (t) => (t.decoder.codeDecoderPage.couldNotOpenLink({ detail: errorText(error, t) })));
      }
    },
    [showToast],
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-rule bg-surface px-4">
        <h2 className="shrink-0 text-sm font-semibold text-ink">{t.decoder.codeDecoderPage.results}</h2>
        {batch && (
          <span className="min-w-0 truncate font-data text-[10.5px] text-ink3">
            {t.decoder.batchSummary({ images: progressTotal ?? summary.imageCount, decoded: summary.decodedImageCount, codes: summary.codeCount })}
          </span>
        )}
        <button
          type="button"
          onClick={() => {
            if (batch) {
              void copyText(buildCopyAllText(batch), (t) => t.decoder.codeDecoderPage.allDecodedResultsCopied);
            }
          }}
          disabled={!batch || summary.codeCount === 0}
          title={t.decoder.codeDecoderPage.copyAll}
          className="ml-auto inline-flex h-7 shrink-0 items-center justify-center gap-2 border border-rule px-2 font-data text-[10.5px] text-ink2 hover:border-ink3 hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ClipboardCopy className="h-4 w-4" />
          <span className="hidden min-[1040px]:inline">{t.decoder.codeDecoderPage.copyAll}</span>
        </button>
      </div>

      {batch ? (
        images.length > 0 ? (
          <div
            ref={scrollRef}
            role="region"
            aria-label={t.decoder.codeDecoderPage.decodedResults}
            tabIndex={0}
            className="min-h-0 flex-1 overflow-auto p-[18px] outline-none"
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
          <div className="m-[18px] flex min-h-36 flex-1 flex-col items-center justify-center gap-2 border border-dashed border-rule bg-surface px-5 text-center text-ink3">
            <ScanBarcode className="h-6 w-6" />
            <span className="text-sm text-ink">{t.decoder.codeDecoderPage.waitingForTheFirstImage}</span>
          </div>
        )
      ) : (
        <div className="m-[18px] flex min-h-36 flex-1 flex-col items-center justify-center gap-2 border border-dashed border-rule bg-surface px-5 text-center text-ink3">
          <ImageIcon className="h-6 w-6" />
          <strong className="text-sm font-semibold text-ink">{t.decoder.codeDecoderPage.noDecodedResultsYet}</strong>
          <span className="text-xs">{t.decoder.codeDecoderPage.dropImagesChooseFilesOrPasteAnImage}</span>
        </div>
      )}
    </div>
  );
}

interface DecodedImageCardProps {
  image: DecodedImage;
  copyText: (text: string, message: Message) => Promise<void>;
  openUrl: (url: string) => Promise<void>;
}

function DecodedImageCard({ image, copyText, openUrl }: DecodedImageCardProps) {
  const t = useT();
  return (
    <article className="overflow-hidden border border-rule bg-surface2">
      <header className="flex h-9 min-w-0 items-center gap-3 border-b border-rule px-3">
        <span className="min-w-0 flex-1 truncate font-data text-[11.5px] font-medium text-ink" title={image.sourceKind === "clipboard" ? t.decoder.codeDecoderPage.clipboardImage : image.name}>
          {image.sourceKind === "clipboard" ? t.decoder.codeDecoderPage.clipboardImage : image.name}
        </span>
        <span className="shrink-0 font-data text-[10.5px] text-ink3">
          {image.error ? t.decoder.codeDecoderPage.failed : t.decoder.codeDecoderPage.codesLabel({ count: image.codes.length })}
        </span>
      </header>
      <div className="grid min-w-0 grid-cols-[96px_minmax(0,1fr)] gap-3 p-3">
        <div className="flex h-24 w-24 items-center justify-center overflow-hidden border border-rule bg-white">
          {image.thumbnail ? (
            <img
              src={image.thumbnail}
              alt=""
              className="h-full w-full object-contain"
              draggable={false}
            />
          ) : (
            <ImageIcon className="h-6 w-6 text-ink3" />
          )}
        </div>

        <div className="min-w-0">
          {image.error ? (
            <div className="break-words text-xs text-err">{t.decoder.decodeFailure({ detail: errorText(image.error, t) })}</div>
          ) : image.codes.length === 0 ? (
            <div className="text-xs text-ink3">{t.decoder.codeDecoderPage.noCodeFound}</div>
          ) : (
            <div className="divide-y divide-dashed divide-rule2">
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
  copyText: (text: string, message: Message) => Promise<void>;
  openUrl: (url: string) => Promise<void>;
}

function DecodedCodeRow({ code, copyText, openUrl }: DecodedCodeRowProps) {
  const t = useT();
  return (
    <div className="flex min-w-0 items-start gap-2 py-2 first:pt-0 last:pb-0">
      <span className="shrink-0 border border-rule px-2 py-1 font-data text-[10.5px] text-ink2">
        {code.format}
      </span>
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-all font-data text-xs leading-5 text-ink">
        {code.text}
      </span>
      <button
        type="button"
        onClick={() => void copyText(code.text, (t) => t.decoder.codeDecoderPage.decodedContentCopied)}
        title={t.common.copy}
        aria-label={t.decoder.codeDecoderPage.copyDecodedContent}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center border border-rule text-ink3 hover:bg-hover hover:text-ink"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
      {code.isUrl && (
        <button
          type="button"
          onClick={() => void openUrl(code.text.trim())}
          title={t.decoder.codeDecoderPage.openInBrowser}
          aria-label={t.decoder.codeDecoderPage.openLinkInBrowser}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center border border-rule text-ink3 hover:bg-hover hover:text-ink"
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
