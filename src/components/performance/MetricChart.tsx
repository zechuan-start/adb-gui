import { useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  computeAdaptiveDomain,
  downsample,
  formatSpanLabel,
  METRICS_CHART_MAX_POINTS,
  type MetricDomain,
} from "@/lib/deviceMetrics";
import type { DeviceMetricsHistoryPoint } from "@/store/deviceMetrics";

const VIEW_WIDTH = 600;
const VIEW_HEIGHT = 150;
const CHART_PADDING = 8;
const PLOT_HEIGHT = VIEW_HEIGHT - CHART_PADDING * 2;
const PLOT_WIDTH = VIEW_WIDTH - CHART_PADDING * 2;
const PLOT_BOTTOM = CHART_PADDING + PLOT_HEIGHT;
const GAP_THRESHOLD_MS = 2_500;
const GRID_RATIOS = [0.25, 0.5, 0.75];
const MEMORY_MIN_SPAN_GB = 0.5;
const PERCENT_DOMAIN: MetricDomain = { min: 0, max: 100 };

interface ChartPoint {
  atMs: number;
  value: number;
  segment: number;
}

interface PositionedChartPoint extends ChartPoint {
  x: number;
  y: number;
}

interface MetricConfig {
  /** Series value in display units, or null when the frame carries no reading. */
  extract: (sample: DeviceMetricsHistoryPoint) => number | null;
  /** Fixed 0-100 keeps CPU comparable across devices; memory needs a tight window. */
  adaptive: boolean;
  stroke: string;
  fill: string;
  formatReadout: (value: number) => string;
  formatAxis: (value: number) => string;
}

const METRIC_CONFIG: Record<"cpu" | "memory", MetricConfig> = {
  cpu: {
    extract: (sample) => sample.cpuPercent,
    adaptive: false,
    stroke: "var(--color-note)",
    fill: "color-mix(in srgb, var(--color-note) 14%, transparent)",
    formatReadout: (value) => `${value.toFixed(1)}%`,
    formatAxis: (value) => `${Math.round(value)}%`,
  },
  memory: {
    extract: (sample) =>
      sample.memoryTotalKb > 0 ? sample.memoryUsedKb / 1024 / 1024 : null,
    adaptive: true,
    stroke: "var(--color-ok)",
    fill: "color-mix(in srgb, var(--color-ok) 14%, transparent)",
    formatReadout: (value) => `${value.toFixed(2)} GB`,
    formatAxis: (value) => value.toFixed(1),
  },
};

interface MetricChartProps {
  title: string;
  metric: "cpu" | "memory";
  samples: readonly DeviceMetricsHistoryPoint[];
  revision: number;
}

export function MetricChart({ title, metric, samples, revision }: MetricChartProps) {
  const [hovered, setHovered] = useState<PositionedChartPoint | null>(null);
  const config = METRIC_CONFIG[metric];
  const chart = useMemo(() => {
    const points: ChartPoint[] = [];
    let segment = 0;
    let previousAt: number | null = null;
    for (const sample of samples) {
      const value = config.extract(sample);
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
    const lastAt = points[points.length - 1]?.atMs ?? firstAt;
    const duration = Math.max(1, lastAt - firstAt);
    const domain = config.adaptive
      ? computeAdaptiveDomain(
          sampled.map((point) => point.value),
          MEMORY_MIN_SPAN_GB,
        )
      : PERCENT_DOMAIN;
    const span = Math.max(1e-6, domain.max - domain.min);
    const scaleY = (value: number) => {
      const ratio = (value - domain.min) / span;
      return CHART_PADDING + (1 - Math.min(1, Math.max(0, ratio))) * PLOT_HEIGHT;
    };
    const positioned: PositionedChartPoint[] = sampled.map((point) => ({
      ...point,
      x: CHART_PADDING + ((point.atMs - firstAt) / duration) * PLOT_WIDTH,
      y: scaleY(point.value),
    }));

    const linePath = positioned
      .map((point, index) => {
        const previous = positioned[index - 1];
        const command = previous && previous.segment === point.segment ? "L" : "M";
        return `${command}${point.x.toFixed(2)},${point.y.toFixed(2)}`;
      })
      .join(" ");

    // One filled area per continuous segment, so collection gaps stay hollow.
    const areaPaths: string[] = [];
    let run: PositionedChartPoint[] = [];
    const flushRun = () => {
      if (run.length >= 2) {
        const body = run
          .map((point) => `L${point.x.toFixed(2)},${point.y.toFixed(2)}`)
          .join(" ");
        areaPaths.push(
          `M${run[0].x.toFixed(2)},${PLOT_BOTTOM} ${body} L${run[run.length - 1].x.toFixed(2)},${PLOT_BOTTOM} Z`,
        );
      }
      run = [];
    };
    for (const point of positioned) {
      if (run.length > 0 && run[run.length - 1].segment !== point.segment) {
        flushRun();
      }
      run.push(point);
    }
    flushRun();

    const grid = GRID_RATIOS.map((ratio) => {
      const value = domain.min + span * ratio;
      return {
        ratio,
        label: config.formatAxis(value),
        y: CHART_PADDING + (1 - ratio) * PLOT_HEIGHT,
        topPercent: ((CHART_PADDING + (1 - ratio) * PLOT_HEIGHT) / VIEW_HEIGHT) * 100,
      };
    });

    return {
      points: positioned,
      linePath,
      areaPaths,
      grid,
      last: positioned[positioned.length - 1] ?? null,
      spanLabel: points.length > 0 ? `${formatSpanLabel(lastAt - firstAt)} · 1s` : "",
    };
  }, [config, revision, samples]);

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

  const readout = hovered
    ? `${new Date(hovered.atMs).toLocaleTimeString("zh-CN", { hour12: false })} / ${config.formatReadout(hovered.value)}`
    : chart.last
      ? config.formatReadout(chart.last.value)
      : "--";

  return (
    <section className="min-w-0 border border-rule bg-surface">
      <div className="flex h-9 items-center justify-between gap-3 border-b border-dashed border-rule px-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <h3 className="shrink-0 text-xs font-semibold text-ink">{title}</h3>
          <span className="truncate font-data text-[10px] text-ink3">{chart.spanLabel}</span>
        </div>
        <output className="shrink-0 font-data text-xs font-medium text-ink">{readout}</output>
      </div>
      <div className="relative h-[136px] w-full">
        {chart.points.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center font-data text-xs text-ink3">
            等待数据
          </div>
        ) : (
          <div className="pointer-events-none absolute inset-y-0 left-0 w-9" aria-hidden="true">
            {chart.grid.map((line) => (
              <span
                key={line.ratio}
                className="absolute right-1.5 -translate-y-1/2 font-data text-[9px] leading-none text-ink3"
                style={{ top: `${line.topPercent}%` }}
              >
                {line.label}
              </span>
            ))}
          </div>
        )}
        <div className="absolute inset-y-0 left-9 right-2">
          <svg
            viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
            preserveAspectRatio="none"
            className="h-full w-full touch-none"
            role="img"
            aria-label={`${title}曲线`}
            onPointerMove={handlePointerMove}
            onPointerLeave={() => setHovered(null)}
          >
            {/* Gridlines only make sense alongside their labels, which the
                empty state hides. */}
            {chart.points.length === 0
              ? null
              : chart.grid.map((line) => (
                  <line
                    key={line.ratio}
                    x1={CHART_PADDING}
                    x2={VIEW_WIDTH - CHART_PADDING}
                    y1={line.y}
                    y2={line.y}
                    stroke="var(--color-rule)"
                    strokeDasharray={line.ratio === 0.5 ? undefined : "2 4"}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
            {chart.areaPaths.map((path, index) => (
              <path key={index} d={path} fill={config.fill} stroke="none" />
            ))}
            <path
              d={chart.linePath}
              fill="none"
              stroke={config.stroke}
              strokeWidth="1.5"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {chart.last ? (
              <circle cx={chart.last.x} cy={chart.last.y} r="2.5" fill={config.stroke} />
            ) : null}
            {hovered ? (
              <>
                <line
                  x1={hovered.x}
                  x2={hovered.x}
                  y1={CHART_PADDING}
                  y2={PLOT_BOTTOM}
                  stroke="var(--color-ink3)"
                  strokeDasharray="3 3"
                  vectorEffect="non-scaling-stroke"
                />
                <circle cx={hovered.x} cy={hovered.y} r="2.5" fill="var(--color-ink)" />
              </>
            ) : null}
          </svg>
        </div>
      </div>
    </section>
  );
}
