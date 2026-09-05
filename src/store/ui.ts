import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { SettingsSection } from "@/lib/settings";

export type PaneId = "tools" | "apps" | "files" | "codegen" | "decoder" | "perf";

export const MIN_LOG_HEIGHT = 120;
export const DEFAULT_LOG_HEIGHT = 320;

const LOG_WORKSPACE_RESERVED_HEIGHT = 220;
const UI_STORAGE_KEY = "adb-gui-ui";
const PANE_IDS: readonly PaneId[] = ["tools", "apps", "files", "codegen", "decoder", "perf"];

export const DEFAULT_LOG_OPEN_BY_PANE: Readonly<Record<PaneId, boolean>> = {
  tools: true,
  apps: true,
  files: true,
  codegen: false,
  decoder: false,
  perf: false,
};

interface PersistedUiPreferences {
  activePane: PaneId;
  logOpenByPane: Record<PaneId, boolean>;
  logHeight: number;
}

export interface UiState extends PersistedUiPreferences {
  settingsSection: SettingsSection | null;
  openSettings: (section: SettingsSection) => void;
  closeSettings: () => void;
  logMaximized: boolean;
  logReadThroughSeq: number | null;
  logQueryFocusNonce: number;
  setActivePane: (pane: PaneId) => void;
  toggleLogOpen: (pane: PaneId) => void;
  setLogOpen: (pane: PaneId, open: boolean) => void;
  setLogHeight: (height: number, viewportHeight: number) => void;
  setLogMaximized: (maximized: boolean) => void;
  setLogReadThroughSeq: (seq: number | null) => void;
  requestLogQueryFocus: () => void;
}

export function clampLogHeight(height: number, viewportHeight: number): number {
  const maximumHeight = Math.max(
    MIN_LOG_HEIGHT,
    viewportHeight - LOG_WORKSPACE_RESERVED_HEIGHT,
  );
  return Math.min(Math.max(height, MIN_LOG_HEIGHT), maximumHeight);
}

export function logcatReadBaseline(latestSeq: number | null, nextSeq: number): number {
  return latestSeq ?? nextSeq - 1;
}

export function deriveLogcatUnreadCount(
  open: boolean,
  totalCount: number,
  latestSeq: number | null,
  readThroughSeq: number | null,
): number {
  if (open || latestSeq === null) {
    return 0;
  }
  return readThroughSeq === null
    ? totalCount
    : Math.max(0, latestSeq - readThroughSeq);
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      settingsSection: null,
      openSettings: (settingsSection) => set({ settingsSection }),
      closeSettings: () => set({ settingsSection: null }),
      activePane: "tools",
      logOpenByPane: { ...DEFAULT_LOG_OPEN_BY_PANE },
      logHeight: DEFAULT_LOG_HEIGHT,
      logMaximized: false,
      logReadThroughSeq: null,
      logQueryFocusNonce: 0,
      setActivePane: (activePane) => {
        set({ activePane, logMaximized: false });
      },
      toggleLogOpen: (pane) => {
        set((state) => {
          const open = !state.logOpenByPane[pane];
          return {
            logOpenByPane: { ...state.logOpenByPane, [pane]: open },
            ...(pane === state.activePane && !open ? { logMaximized: false } : {}),
          };
        });
      },
      setLogOpen: (pane, open) => {
        set((state) => ({
          logOpenByPane: { ...state.logOpenByPane, [pane]: open },
          ...(pane === state.activePane && !open ? { logMaximized: false } : {}),
        }));
      },
      setLogHeight: (height, viewportHeight) => {
        set({ logHeight: clampLogHeight(height, viewportHeight) });
      },
      setLogMaximized: (logMaximized) => {
        set({ logMaximized });
      },
      setLogReadThroughSeq: (logReadThroughSeq) => {
        set({ logReadThroughSeq });
      },
      requestLogQueryFocus: () => {
        set((state) => ({ logQueryFocusNonce: state.logQueryFocusNonce + 1 }));
      },
    }),
    {
      name: UI_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state): PersistedUiPreferences => ({
        activePane: state.activePane,
        logOpenByPane: state.logOpenByPane,
        logHeight: state.logHeight,
      }),
      merge: mergePersistedPreferences,
    },
  ),
);

function mergePersistedPreferences(persistedState: unknown, currentState: UiState): UiState {
  if (!isRecord(persistedState)) {
    return currentState;
  }

  return {
    ...currentState,
    activePane: isPaneId(persistedState.activePane)
      ? persistedState.activePane
      : currentState.activePane,
    logOpenByPane: restoreLogOpenByPane(persistedState.logOpenByPane),
    logHeight: isValidPersistedLogHeight(persistedState.logHeight)
      ? persistedState.logHeight
      : currentState.logHeight,
    logMaximized: false,
    logReadThroughSeq: null,
    logQueryFocusNonce: 0,
  };
}

function restoreLogOpenByPane(value: unknown): Record<PaneId, boolean> {
  const restored = { ...DEFAULT_LOG_OPEN_BY_PANE };
  if (!isRecord(value)) {
    return restored;
  }

  for (const pane of PANE_IDS) {
    const open = value[pane];
    if (typeof open === "boolean") {
      restored[pane] = open;
    }
  }
  return restored;
}

function isPaneId(value: unknown): value is PaneId {
  return typeof value === "string" && PANE_IDS.some((pane) => pane === value);
}

function isValidPersistedLogHeight(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= MIN_LOG_HEIGHT;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
