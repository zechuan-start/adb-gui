import { useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  downsample,
  METRICS_CHART_MAX_POINTS,
} from "@/lib/deviceMetrics";
import type { DeviceMetricsHistoryPoint } from "@/store/deviceMetrics";

const VIEW_WIDTH = 600;
const VIEW_HEIGHT = 150;
const CHART_PADDING = 8;
const GAP_THRESHOLD_MS = 2_500;

interface ChartPoint {
  atMs: number;
  value: number;
  segment: number;
}

interface PositionedChartPoint extends ChartPoint {
  x: number;
  y: number;
}

interface MetricChartProps {
  title: string;
  metric: "cpu" | "memory";
  samples: readonly DeviceMetricsHistoryPoint[];
  revision: number;
}

function sampleValue(
  sample: DeviceMetricsHistoryPoint,
  metric: MetricChartProps["metric"],
): number | null {
  if (metric === "cpu") {
    return sample.cpuPercent;
  }
  return sample.memoryTotalKb > 0
    ? (sample.memoryUsedKb * 100) / sample.memoryTotalKb
    : null;
}

export function MetricChart({ title, metric, samples, revision }: MetricChartProps) {
  const [hovered, setHovered] = useState<PositionedChartPoint | null>(null);
  const chart = useMemo(() => {
    const points: ChartPoint[] = [];
    let segment = 0;
    let previousAt: number | null = null;
    for (const sample of samples) {
      const value = sampleValue(sample, metric);
      if (value === null || !Number.isFinite(value)) {
        continue;
      }
      if (previousAt !== null && sample.atMs - previousAt > GAP_THRESHOLD_MS) {
        segment += 1;
      }
      points.push({ atMs: sample.atMs, value, segment });
      previousAt = sample.atMs;
    }
    const sampled = downsample(points, METRICS_CHART_MAX_POINTS, (point) => point.value);
    const firstAt = points[0]?.atMs ?? 0;
    const lastAt = points[points.length - 1]?.atMs ?? firstAt + 1;
    const duration = Math.max(1, lastAt - firstAt);
    const positioned = sampled.map((point) => ({
      ...point,
      x: CHART_PADDING + ((point.atMs - firstAt) / duration) * (VIEW_WIDTH - CHART_PADDING * 2),
      y:
        CHART_PADDING +
        (1 - Math.min(100, Math.max(0, point.value)) / 100) *
          (VIEW_HEIGHT - CHART_PADDING * 2),
    }));
    const path = positioned
      .map((point, index) => {
        const previous = positioned[index - 1];
        const command = previous && previous.segment === point.segment ? "L" : "M";
        return `${command}${point.x.toFixed(2)},${point.y.toFixed(2)}`;
      })
      .join(" ");
    return { points: positioned, path };
  }, [metric, revision, samples]);

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (chart.points.length === 0) {
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const viewX = ((event.clientX - bounds.left) / bounds.width) * VIEW_WIDTH;
    let closest = chart.points[0];
    for (const point of chart.points) {
      if (Math.abs(point.x - viewX) < Math.abs(closest.x - viewX)) {
        closest = point;
      }
    }
    setHovered(closest);
  }

  return (
    <section className="min-w-0 border border-rule bg-surface">
      <div className="flex h-9 items-center justify-between border-b border-dashed border-rule px-3">
        <h3 className="text-xs font-semibold text-ink">{title}</h3>
        <output className="font-data text-xs text-ink2">
          {hovered
            ? `${new Date(hovered.atMs).toLocaleTimeString("zh-CN", { hour12: false })} / ${hovered.value.toFixed(1)}%`
            : chart.points.length > 0
              ? "LIVE"
              : "--"}
        </output>
      </div>
      <div className="relative aspect-[3/1] min-h-[132px] w-full">
        {chart.points.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center font-data text-xs text-ink3">
            等待数据
          </div>
        ) : null}
        <svg
          viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full touch-none"
          role="img"
          aria-label={`${title}曲线`}
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHovered(null)}
        >
          {[25, 50, 75].map((value) => {
            const y = CHART_PADDING + (1 - value / 100) * (VIEW_HEIGHT - CHART_PADDING * 2);
            return (
              <line
                key={value}
                x1={CHART_PADDING}
                x2={VIEW_WIDTH - CHART_PADDING}
                y1={y}
                y2={y}
                stroke="var(--color-rule2)"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
          <path
            d={chart.path}
            fill="none"
            stroke={metric === "cpu" ? "var(--color-note)" : "var(--color-ok)"}
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
          {hovered ? (
            <line
              x1={hovered.x}
              x2={hovered.x}
              y1={CHART_PADDING}
              y2={VIEW_HEIGHT - CHART_PADDING}
              stroke="var(--color-ink3)"
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </svg>
      </div>
    </section>
  );
}
