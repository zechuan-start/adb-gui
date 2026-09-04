import { beforeEach, describe, expect, it, vi } from "vitest";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const storage = new MemoryStorage();
vi.stubGlobal("localStorage", storage);

describe("useUiStore", () => {
  beforeEach(() => {
    storage.clear();
    vi.resetModules();
  });

  it("starts with the planned pane and per-pane Logcat defaults", async () => {
    const { DEFAULT_LOG_HEIGHT, useUiStore } = await import("@/store/ui");

    expect(useUiStore.getState()).toMatchObject({
      activePane: "tools",
      logOpenByPane: {
        tools: true,
        apps: true,
        files: true,
        codegen: false,
        decoder: false,
        perf: false,
      },
      logHeight: DEFAULT_LOG_HEIGHT,
      logMaximized: false,
      logReadThroughSeq: null,
      logQueryFocusNonce: 0,
    });
  });

  it("remembers Logcat visibility independently for every pane", async () => {
    const { useUiStore } = await import("@/store/ui");

    useUiStore.getState().setLogOpen("apps", false);
    useUiStore.getState().toggleLogOpen("codegen");

    expect(useUiStore.getState().logOpenByPane).toEqual({
      tools: true,
      apps: false,
      files: true,
      codegen: true,
      decoder: false,
      perf: false,
    });
  });

  it("exits Logcat maximized mode when changing panes", async () => {
    const { useUiStore } = await import("@/store/ui");

    useUiStore.getState().setLogMaximized(true);
    useUiStore.getState().setActivePane("apps");

    expect(useUiStore.getState().activePane).toBe("apps");
    expect(useUiStore.getState().logMaximized).toBe(false);
    expect(useUiStore.getState().logOpenByPane.apps).toBe(true);
  });

  it("clamps Logcat height to the current viewport boundary", async () => {
    const { MIN_LOG_HEIGHT, clampLogHeight, useUiStore } = await import("@/store/ui");

    expect(clampLogHeight(80, 600)).toBe(MIN_LOG_HEIGHT);
    expect(clampLogHeight(900, 600)).toBe(380);
    expect(clampLogHeight(300, 300)).toBe(MIN_LOG_HEIGHT);

    useUiStore.getState().setLogHeight(900, 800);
    expect(useUiStore.getState().logHeight).toBe(580);
  });

  it("records non-persistent Logcat query focus requests", async () => {
    const { useUiStore } = await import("@/store/ui");

    useUiStore.getState().requestLogQueryFocus();
    useUiStore.getState().requestLogQueryFocus();

    expect(useUiStore.getState().logQueryFocusNonce).toBe(2);
    const persisted = JSON.parse(storage.getItem("adb-gui-ui") ?? "null");
    expect(persisted.state.logQueryFocusNonce).toBeUndefined();
  });

  it("derives unread rows from real buffer identity without empty-buffer ghosts", async () => {
    const { deriveLogcatUnreadCount, logcatReadBaseline } = await import("@/store/ui");

    expect(logcatReadBaseline(null, 42)).toBe(41);
    expect(logcatReadBaseline(48, 49)).toBe(48);
    expect(deriveLogcatUnreadCount(false, 0, null, 20)).toBe(0);
    expect(deriveLogcatUnreadCount(true, 25, 44, 20)).toBe(0);
    expect(deriveLogcatUnreadCount(false, 25, 44, null)).toBe(25);
    expect(deriveLogcatUnreadCount(false, 10_000, 20_500, 9_500)).toBe(11_000);
  });

  it("restores preferences without persisting temporary Logcat state", async () => {
    const firstModule = await import("@/store/ui");
    firstModule.useUiStore.getState().setActivePane("files");
    firstModule.useUiStore.getState().setLogOpen("files", false);
    firstModule.useUiStore.getState().setLogHeight(420, 800);
    firstModule.useUiStore.getState().setLogMaximized(true);
    firstModule.useUiStore.getState().setLogReadThroughSeq(42);

    const persisted = JSON.parse(storage.getItem("adb-gui-ui") ?? "null");
    expect(persisted.state).toEqual({
      activePane: "files",
      logOpenByPane: {
        tools: true,
        apps: true,
        files: false,
        codegen: false,
        decoder: false,
        perf: false,
      },
      logHeight: 420,
    });

    vi.resetModules();
    const restoredModule = await import("@/store/ui");
    expect(restoredModule.useUiStore.getState()).toMatchObject({
      activePane: "files",
      logOpenByPane: {
        tools: true,
        apps: true,
        files: false,
        codegen: false,
        decoder: false,
        perf: false,
      },
      logHeight: 420,
      logMaximized: false,
      logReadThroughSeq: null,
      logQueryFocusNonce: 0,
    });
  });
});
