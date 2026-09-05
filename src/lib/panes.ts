export type PaneId = "tools" | "apps" | "files" | "codegen" | "decoder" | "perf";

export const PANE_IDS: readonly PaneId[] = [
  "tools",
  "apps",
  "files",
  "codegen",
  "decoder",
  "perf",
];

export const DEFAULT_LOG_OPEN_BY_PANE: Readonly<Record<PaneId, boolean>> = {
  tools: true,
  apps: true,
  files: true,
  codegen: false,
  decoder: false,
  perf: false,
};
