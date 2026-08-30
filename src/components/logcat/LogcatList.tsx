import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type MouseEvent,
  type RefObject,
} from "react";
import { ArrowDownToLine } from "lucide-react";
import {
  useVirtualizer,
  type Virtualizer,
} from "@tanstack/react-virtual";
import { useFollowScroll } from "@/hooks/useFollowScroll";
import {
  findFilteredSeqIndex,
  LOGCAT_ROW_HEIGHT,
  type LogcatRingBuffer,
} from "@/lib/logcat";
import { formatQueryValue } from "@/lib/logcatQuery";
import { columnSignature, type LogcatColumn } from "@/lib/logcatView";
import { useLogcatStore } from "@/store/logcat";
import { LogcatRow } from "@/components/logcat/LogcatRow";

interface LogcatListProps {
  visible: boolean;
  loading: boolean;
}

type ItemOffsetResolver = (index: number) => number;
type LogcatVirtualizer = Virtualizer<HTMLDivElement, HTMLDivElement>;

interface LogcatVirtualRowsProps {
  visible: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  buffer: LogcatRingBuffer;
  filteredSeqs: number[];
  filteredHead: number;
  filteredCount: number;
  revision: number;
  anchoredSeq: number | null;
  columns: Readonly<Record<LogcatColumn, boolean>>;
  softWrap: boolean;
  onTagClick: (tag: string) => void;
  onMeasurementsChanged: () => void;
  setItemOffsetResolver: (resolver: ItemOffsetResolver) => void;
}

function fixedItemOffset(index: number): number {
  return index * LOGCAT_ROW_HEIGHT;
}

function measuredItemOffset(virtualizer: LogcatVirtualizer, index: number): number {
  const renderedItem = virtualizer
    .getVirtualItems()
    .find((item) => item.index === index);
  if (renderedItem) {
    return renderedItem.start;
  }
  return virtualizer.getOffsetForIndex(index, "start")?.[0] ?? fixedItemOffset(index);
}

function LogcatVirtualRowsView({
  visible,
  scrollRef,
  buffer,
  filteredSeqs,
  filteredHead,
  filteredCount,
  revision,
  anchoredSeq,
  columns,
  softWrap,
  onTagClick,
  onMeasurementsChanged,
  setItemOffsetResolver,
}: LogcatVirtualRowsProps) {
  const previouslyVisibleRef = useRef(visible);
  const getItemKey = useCallback(
    (index: number) => filteredSeqs[filteredHead + index] ?? -(index + 1),
    [filteredHead, filteredSeqs, revision],
  );
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: filteredCount,
    getScrollElement: () => scrollRef.current,
    getItemKey,
    estimateSize: () => LOGCAT_ROW_HEIGHT,
    overscan: 30,
    onChange: (_instance, sync) => {
      if (softWrap && !sync) {
        onMeasurementsChanged();
      }
    },
  });

  setItemOffsetResolver(
    softWrap
      ? (index) => measuredItemOffset(virtualizer, index)
      : fixedItemOffset,
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
    <div
      style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}
    >
      {virtualizer.getVirtualItems().map((virtualItem) => {
        const seq = filteredSeqs[filteredHead + virtualItem.index];
        const entry = seq === undefined ? undefined : buffer.bySeq(seq);
        if (!entry) {
          return null;
        }
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
              height: softWrap ? undefined : `${LOGCAT_ROW_HEIGHT}px`,
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            <LogcatRow
              entry={entry}
              anchored={entry.seq === anchoredSeq}
              columns={columns}
              softWrap={softWrap}
              onTagClick={onTagClick}
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
  const columns = useLogcatStore((state) => state.columns);
  const softWrap = useLogcatStore((state) => state.softWrap);
  const setFollowMode = useLogcatStore((state) => state.setFollowMode);
  const setAnchoredSeq = useLogcatStore((state) => state.setAnchoredSeq);
  const itemOffsetResolverRef = useRef<ItemOffsetResolver>(fixedItemOffset);
  const measurementFrameRef = useRef<number | null>(null);
  const layoutKey = `${softWrap ? "wrap" : "fixed"}:${columnSignature(columns)}`;

  const anchorIndex = useMemo(
    () =>
      anchoredSeq === null
        ? null
        : findFilteredSeqIndex(
            filteredSeqs,
            filteredHead,
            filteredCount,
            anchoredSeq,
          ),
    [anchoredSeq, filteredCount, filteredHead, filteredSeqs, revision],
  );
  const getItemOffset = useCallback(
    (index: number) => itemOffsetResolverRef.current(index),
    [layoutKey],
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

  function handleSurfaceClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target;
    const row = target instanceof Element
      ? target.closest<HTMLElement>("[data-logcat-seq]")
      : null;
    if (!row || !event.currentTarget.contains(row)) {
      followScroll.detachAt(null, null);
      return;
    }
    const seq = Number(row.dataset.logcatSeq);
    const index = Number.isSafeInteger(seq)
      ? findFilteredSeqIndex(filteredSeqs, filteredHead, filteredCount, seq)
      : null;
    followScroll.detachAt(index === null ? null : seq, index);
  }

  return (
    <div className="relative flex min-h-0 flex-1">
      <div
        ref={followScroll.scrollRef}
        className="min-h-0 flex-1 overflow-auto font-mono text-xs"
        onClickCapture={handleSurfaceClick}
        onScroll={followScroll.onScroll}
        onWheel={followScroll.onWheel}
        onPointerDown={followScroll.onPointerDown}
        onTouchStart={followScroll.onTouchStart}
        onTouchMove={followScroll.onTouchMove}
        onTouchEnd={followScroll.onTouchEnd}
        onTouchCancel={followScroll.onTouchEnd}
      >
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            正在连接日志流...
          </div>
        ) : totalCount === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            暂无日志
          </div>
        ) : filteredCount === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            没有匹配当前查询的日志
          </div>
        ) : (
          <LogcatVirtualRows
            key={softWrap ? "wrapped" : "fixed"}
            visible={visible}
            scrollRef={followScroll.scrollRef}
            buffer={buffer}
            filteredSeqs={filteredSeqs}
            filteredHead={filteredHead}
            filteredCount={filteredCount}
            revision={revision}
            anchoredSeq={anchoredSeq}
            columns={columns}
            softWrap={softWrap}
            onTagClick={handleTagClick}
            onMeasurementsChanged={scheduleMeasurementCompensation}
            setItemOffsetResolver={setItemOffsetResolver}
          />
        )}
      </div>

      {followMode === "detached" && (
        <button
          type="button"
          onClick={followScroll.scrollToBottom}
          className="absolute bottom-4 right-4 inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-popover px-3 text-xs text-popover-foreground shadow-lg transition-colors hover:bg-secondary"
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
