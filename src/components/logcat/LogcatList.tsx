import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { ArrowDownToLine } from "lucide-react";
import {
  useVirtualizer,
  type Virtualizer,
} from "@tanstack/react-virtual";
import { useFollowScroll } from "@/hooks/useFollowScroll";
import { LOGCAT_ROW_HEIGHT, type LogcatRingBuffer } from "@/lib/logcat";
import { formatQueryValue } from "@/lib/logcatQuery";
import {
  groupCrashTraces,
  type LogcatRenderItem,
} from "@/lib/logcatRender";
import {
  hasNativeTextSelection,
  resolveCopyAction,
  type CopyTargetSnapshot,
} from "@/lib/logcatSelection";
import { columnSignature, type LogcatColumn } from "@/lib/logcatView";
import { useFeedbackStore } from "@/store/feedback";
import { useLogcatStore } from "@/store/logcat";
import { useSettingsStore } from "@/store/settings";
import { LogcatRow } from "@/components/logcat/LogcatRow";

interface LogcatListProps {
  visible: boolean;
  loading: boolean;
}

type ItemOffsetResolver = (index: number) => number;
type LogcatVirtualizer = Virtualizer<HTMLDivElement, HTMLDivElement>;

interface SelectionGesture {
  seq: number;
  index: number;
  detached: boolean;
}

interface LogcatVirtualRowsProps {
  visible: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  buffer: LogcatRingBuffer;
  renderItems: readonly LogcatRenderItem[];
  columns: Readonly<Record<LogcatColumn, boolean>>;
  softWrap: boolean;
  cozyRows: boolean;
  rowHeight: number;
  selectedSeq: number | null;
  onTagClick: (tag: string) => void;
  onToggleTrace: (seq: number) => void;
  onMeasurementsChanged: () => void;
  setItemOffsetResolver: (resolver: ItemOffsetResolver) => void;
}

function fixedItemOffset(index: number, rowHeight: number): number {
  return index * rowHeight;
}

function measuredItemOffset(
  virtualizer: LogcatVirtualizer,
  index: number,
  rowHeight: number,
): number {
  const renderedItem = virtualizer
    .getVirtualItems()
    .find((item) => item.index === index);
  if (renderedItem) {
    return renderedItem.start;
  }
  return virtualizer.getOffsetForIndex(index, "start")?.[0]
    ?? fixedItemOffset(index, rowHeight);
}

function findRenderItemIndex(
  renderItems: readonly LogcatRenderItem[],
  seq: number,
): number | null {
  let low = 0;
  let high = renderItems.length - 1;
  while (low <= high) {
    const middle = low + Math.floor((high - low) / 2);
    const candidate = renderItems[middle]?.seq;
    if (candidate === seq) {
      return middle;
    }
    if (candidate < seq) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return null;
}

function LogcatVirtualRowsView({
  visible,
  scrollRef,
  buffer,
  renderItems,
  columns,
  softWrap,
  cozyRows,
  rowHeight,
  selectedSeq,
  onTagClick,
  onToggleTrace,
  onMeasurementsChanged,
  setItemOffsetResolver,
}: LogcatVirtualRowsProps) {
  const previouslyVisibleRef = useRef(visible);
  const getItemKey = useCallback(
    (index: number) => renderItems[index]?.seq ?? -(index + 1),
    [renderItems],
  );
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: renderItems.length,
    getScrollElement: () => scrollRef.current,
    getItemKey,
    estimateSize: () => rowHeight,
    overscan: 30,
    onChange: (_instance, sync) => {
      if (softWrap && !sync) {
        onMeasurementsChanged();
      }
    },
  });

  setItemOffsetResolver(
    softWrap
      ? (index) => measuredItemOffset(virtualizer, index, rowHeight)
      : (index) => fixedItemOffset(index, rowHeight),
  );

  useEffect(() => {
    const wasVisible = previouslyVisibleRef.current;
    previouslyVisibleRef.current = visible;
    if (!softWrap || !visible || wasVisible) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      virtualizer.measure();
      virtualizer.elementsCache.forEach((element) => {
        virtualizer.measureElement(element);
      });
      onMeasurementsChanged();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [onMeasurementsChanged, softWrap, virtualizer, visible]);

  return (
    <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
      {virtualizer.getVirtualItems().map((virtualItem) => {
        const renderItem = renderItems[virtualItem.index];
        const entry = renderItem ? buffer.bySeq(renderItem.seq) : undefined;
        if (!renderItem || !entry) {
          return null;
        }
        const traceCount = renderItem.kind === "crash-head"
          ? renderItem.traceSeqs.length
          : 0;
        const traceExpanded = renderItem.kind === "crash-head" && renderItem.expanded;
        return (
          <div
            key={virtualItem.key}
            ref={softWrap ? virtualizer.measureElement : undefined}
            data-index={virtualItem.index}
            data-seq={entry.seq}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: softWrap ? undefined : `${rowHeight}px`,
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            <LogcatRow
              entry={entry}
              selected={entry.seq === selectedSeq}
              columns={columns}
              softWrap={softWrap}
              cozy={cozyRows}
              traceCount={traceCount}
              traceExpanded={traceExpanded}
              onTagClick={onTagClick}
              onToggleTrace={onToggleTrace}
            />
          </div>
        );
      })}
    </div>
  );
}

const LogcatVirtualRows = memo(LogcatVirtualRowsView);
LogcatVirtualRows.displayName = "LogcatVirtualRows";

export function LogcatList({ visible, loading }: LogcatListProps) {
  const buffer = useLogcatStore((state) => state.buffer);
  const filteredSeqs = useLogcatStore((state) => state.filteredSeqs);
  const filteredHead = useLogcatStore((state) => state.filteredHead);
  const totalCount = useLogcatStore((state) => state.totalCount);
  const filteredCount = useLogcatStore((state) => state.filteredCount);
  const revision = useLogcatStore((state) => state.revision);
  const streamMode = useLogcatStore((state) => state.streamMode);
  const followMode = useLogcatStore((state) => state.followMode);
  const detachedNewCount = useLogcatStore((state) => state.detachedNewCount);
  const anchoredSeq = useLogcatStore((state) => state.anchoredSeq);
  const selectedSeq = useLogcatStore((state) => state.selectedSeq);
  const autoFold = useSettingsStore((state) => state.preferences.logcat.autoFold);
  const expandedCrashSeqs = useLogcatStore((state) => state.expandedCrashSeqs);
  const cozyRows = useSettingsStore((state) => state.preferences.logcat.cozyRows);
  const columns = useSettingsStore((state) => state.preferences.logcat.columns);
  const softWrap = useSettingsStore((state) => state.preferences.logcat.softWrap);
  const setFollowMode = useLogcatStore((state) => state.setFollowMode);
  const setAnchoredSeq = useLogcatStore((state) => state.setAnchoredSeq);
  const setSelectedSeq = useLogcatStore((state) => state.setSelectedSeq);
  const toggleCrashExpanded = useLogcatStore((state) => state.toggleCrashExpanded);
  const rowHeight = cozyRows ? 24 : LOGCAT_ROW_HEIGHT;
  const itemOffsetResolverRef = useRef<ItemOffsetResolver>(
    (index) => fixedItemOffset(index, rowHeight),
  );
  const measurementFrameRef = useRef<number | null>(null);
  const selectionGestureRef = useRef<SelectionGesture | null>(null);

  const renderItems = useMemo(
    () => groupCrashTraces({
      buffer,
      filteredSeqs,
      filteredHead,
      filteredCount,
      autoFold,
      expandedCrashSeqs,
    }),
    [
      autoFold,
      buffer,
      expandedCrashSeqs,
      filteredCount,
      filteredHead,
      filteredSeqs,
      revision,
    ],
  );
  const layoutKey = `${softWrap ? "wrap" : "fixed"}:${rowHeight}:${columnSignature(columns)}`;
  const anchorIndex = useMemo(
    () => anchoredSeq === null ? null : findRenderItemIndex(renderItems, anchoredSeq),
    [anchoredSeq, renderItems],
  );
  const getItemOffset = useCallback(
    (index: number) => itemOffsetResolverRef.current(index),
    [layoutKey, renderItems],
  );
  const followScroll = useFollowScroll({
    visible,
    followMode,
    setFollowMode,
    anchoredSeq,
    anchorIndex,
    setAnchoredSeq,
    revision,
    getItemOffset,
  });
  const setItemOffsetResolver = useCallback((resolver: ItemOffsetResolver) => {
    itemOffsetResolverRef.current = resolver;
  }, []);
  const scheduleMeasurementCompensation = useCallback(() => {
    if (!softWrap || !visible || measurementFrameRef.current !== null) {
      return;
    }
    measurementFrameRef.current = window.requestAnimationFrame(() => {
      measurementFrameRef.current = null;
      followScroll.measureNow();
    });
  }, [followScroll.measureNow, softWrap, visible]);

  useEffect(() => {
    if (softWrap || measurementFrameRef.current === null) {
      return;
    }
    window.cancelAnimationFrame(measurementFrameRef.current);
    measurementFrameRef.current = null;
  }, [softWrap]);

  useEffect(
    () => () => {
      if (measurementFrameRef.current !== null) {
        window.cancelAnimationFrame(measurementFrameRef.current);
        measurementFrameRef.current = null;
      }
    },
    [],
  );

  const handleTagClick = useCallback((tag: string) => {
    useLogcatStore.getState().appendToQuery(`tag:${formatQueryValue(tag)}`);
  }, []);

  const finishSelectionGesture = useCallback(() => {
    const gesture = selectionGestureRef.current;
    selectionGestureRef.current = null;
    if (!gesture || hasNativeTextSelection(window.getSelection()?.toString() ?? null)) {
      return;
    }
    if (!gesture.detached) {
      followScroll.detachAt(gesture.seq, gesture.index);
    }
    const currentSelectedSeq = useLogcatStore.getState().selectedSeq;
    setSelectedSeq(currentSelectedSeq === gesture.seq ? null : gesture.seq);
  }, [followScroll.detachAt, setSelectedSeq]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    function cancelSelectionGesture(): void {
      selectionGestureRef.current = null;
    }
    window.addEventListener("pointerup", finishSelectionGesture);
    window.addEventListener("pointercancel", cancelSelectionGesture);
    return () => {
      window.removeEventListener("pointerup", finishSelectionGesture);
      window.removeEventListener("pointercancel", cancelSelectionGesture);
      selectionGestureRef.current = null;
    };
  }, [finishSelectionGesture, visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    async function copySelectedLine(text: string): Promise<void> {
      try {
        await navigator.clipboard.writeText(text);
      } catch (error) {
        useFeedbackStore.getState().showToast("error", `复制日志失败: ${String(error)}`);
      }
    }

    function handleCopyShortcut(event: KeyboardEvent): void {
      if (
        event.key.toLowerCase() !== "c" ||
        !(event.metaKey || event.ctrlKey) ||
        event.altKey
      ) {
        return;
      }
      const target: CopyTargetSnapshot | null = event.target instanceof HTMLElement
        ? {
            tagName: event.target.tagName,
            isContentEditable: event.target.isContentEditable,
          }
        : null;
      const state = useLogcatStore.getState();
      const action = resolveCopyAction({
        target,
        nativeSelectionText: window.getSelection()?.toString() ?? null,
        selectedSeq: state.selectedSeq,
        selectedEntry:
          state.selectedSeq === null ? null : state.buffer.bySeq(state.selectedSeq) ?? null,
      });
      if (!action) {
        return;
      }
      event.preventDefault();
      void copySelectedLine(action.text);
    }

    window.addEventListener("keydown", handleCopyShortcut);
    return () => window.removeEventListener("keydown", handleCopyShortcut);
  }, [visible]);

  function handleSurfacePointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    followScroll.onPointerDown(event);
    if (event.button !== 0 || !(event.target instanceof Element)) {
      return;
    }
    const row = event.target.closest<HTMLElement>("[data-logcat-seq]");
    if (!row || !event.currentTarget.contains(row)) {
      selectionGestureRef.current = null;
      return;
    }
    if (event.target.closest("button, input, textarea, select, a")) {
      selectionGestureRef.current = null;
      return;
    }
    const seq = Number(row.dataset.logcatSeq);
    const index = Number.isSafeInteger(seq) ? findRenderItemIndex(renderItems, seq) : null;
    if (index === null) {
      selectionGestureRef.current = null;
      return;
    }
    const detached = event.target.closest("[data-logcat-message]") !== null;
    selectionGestureRef.current = { seq, index, detached };
    if (detached) {
      followScroll.detachAt(seq, index);
    }
  }

  return (
    <div className="relative flex min-h-0 flex-1 bg-log-bg">
      <div
        ref={followScroll.scrollRef}
        className="min-h-0 flex-1 overflow-auto bg-log-bg font-data text-[11px]"
        onScroll={followScroll.onScroll}
        onWheel={followScroll.onWheel}
        onPointerDownCapture={handleSurfacePointerDown}
        onTouchStart={followScroll.onTouchStart}
        onTouchMove={followScroll.onTouchMove}
        onTouchEnd={followScroll.onTouchEnd}
        onTouchCancel={followScroll.onTouchEnd}
      >
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-log-dim">
            正在连接日志流...
          </div>
        ) : totalCount === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-log-dim">
            暂无日志
          </div>
        ) : filteredCount === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-log-dim">
            没有匹配当前查询的日志
          </div>
        ) : (
          <LogcatVirtualRows
            key={`${softWrap ? "wrapped" : "fixed"}:${rowHeight}`}
            visible={visible}
            scrollRef={followScroll.scrollRef}
            buffer={buffer}
            renderItems={renderItems}
            columns={columns}
            softWrap={softWrap}
            cozyRows={cozyRows}
            rowHeight={rowHeight}
            selectedSeq={selectedSeq}
            onTagClick={handleTagClick}
            onToggleTrace={toggleCrashExpanded}
            onMeasurementsChanged={scheduleMeasurementCompensation}
            setItemOffsetResolver={setItemOffsetResolver}
          />
        )}
      </div>

      {followMode === "detached" && (
        <button
          type="button"
          onClick={followScroll.scrollToBottom}
          className="absolute bottom-3 right-3 inline-flex h-7 items-center gap-1.5 border border-rule bg-log-bg px-2.5 text-[11px] text-ink shadow-[2px_2px_0_var(--color-hard-shadow)] hover:bg-hover"
          title="回到底部并跟随"
        >
          <ArrowDownToLine className="h-3.5 w-3.5" />
          {streamMode === "live" && detachedNewCount > 0
            ? `新增 ${detachedNewCount} 行`
            : "回到底部"}
        </button>
      )}
    </div>
  );
}
