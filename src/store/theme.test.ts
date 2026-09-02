import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ThemeModule = typeof import("@/store/theme");

let loadedThemeModule: ThemeModule | null = null;

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  loadedThemeModule?.disposeThemeListener();
  loadedThemeModule = null;
  vi.unstubAllGlobals();
});

describe("useThemeStore", () => {
  it("repairs an invalid persisted value to system", async () => {
    const storage = storageHarness({ theme: "sepia" });
    const media = modernMediaHarness(true);
    const document = documentHarness();
    installBrowser(storage.api, media.api, document.api);

    const themeModule = await loadThemeModule();

    expect(themeModule.useThemeStore.getState().theme).toBe("system");
    expect(storage.values.get("theme")).toBe("system");
    expect(document.toggleDark).toHaveBeenLastCalledWith("dark", true);
  });

  it("falls back to light when matchMedia is unavailable", async () => {
    const storage = storageHarness();
    const document = documentHarness();
    installBrowser(storage.api, null, document.api);

    const themeModule = await loadThemeModule();

    expect(themeModule.useThemeStore.getState().theme).toBe("system");
    expect(document.toggleDark).toHaveBeenLastCalledWith("dark", false);
  });

  it("persists and applies all explicit theme choices", async () => {
    const storage = storageHarness();
    const media = modernMediaHarness(false);
    const document = documentHarness();
    installBrowser(storage.api, media.api, document.api);
    const themeModule = await loadThemeModule();

    themeModule.useThemeStore.getState().setTheme("dark");
    expect(storage.values.get("theme")).toBe("dark");
    expect(document.toggleDark).toHaveBeenLastCalledWith("dark", true);

    themeModule.useThemeStore.getState().setTheme("light");
    expect(storage.values.get("theme")).toBe("light");
    expect(document.toggleDark).toHaveBeenLastCalledWith("dark", false);

    themeModule.useThemeStore.getState().setTheme("system");
    expect(storage.values.get("theme")).toBe("system");
    expect(document.toggleDark).toHaveBeenLastCalledWith("dark", false);
  });

  it("follows media changes only while system is selected", async () => {
    const storage = storageHarness();
    const media = modernMediaHarness(false);
    const document = documentHarness();
    installBrowser(storage.api, media.api, document.api);
    const themeModule = await loadThemeModule();

    document.toggleDark.mockClear();
    media.emit(true);
    expect(document.toggleDark).toHaveBeenLastCalledWith("dark", true);

    themeModule.useThemeStore.getState().setTheme("light");
    document.toggleDark.mockClear();
    media.emit(false);
    media.emit(true);
    expect(document.toggleDark).not.toHaveBeenCalled();

    themeModule.useThemeStore.getState().setTheme("system");
    expect(document.toggleDark).toHaveBeenLastCalledWith("dark", true);
  });

  it("removes a modern media listener during cleanup", async () => {
    const storage = storageHarness();
    const media = modernMediaHarness(false);
    const document = documentHarness();
    installBrowser(storage.api, media.api, document.api);
    const themeModule = await loadThemeModule();
    const listener = media.addEventListener.mock.calls[0]?.[1];

    themeModule.disposeThemeListener();

    expect(listener).toBeDefined();
    expect(media.removeEventListener).toHaveBeenCalledWith("change", listener);
  });

  it("supports and cleans up the legacy media listener API", async () => {
    const storage = storageHarness();
    const media = legacyMediaHarness(false);
    const document = documentHarness();
    installBrowser(storage.api, media.api, document.api);
    const themeModule = await loadThemeModule();
    const listener = media.addListener.mock.calls[0]?.[0];

    media.emit(true);
    expect(document.toggleDark).toHaveBeenLastCalledWith("dark", true);
    themeModule.disposeThemeListener();

    expect(listener).toBeDefined();
    expect(media.removeListener).toHaveBeenCalledWith(listener);
  });
});

async function loadThemeModule(): Promise<ThemeModule> {
  loadedThemeModule = await import("@/store/theme");
  return loadedThemeModule;
}

function installBrowser(
  storage: ReturnType<typeof storageHarness>["api"],
  media:
    | ReturnType<typeof modernMediaHarness>["api"]
    | ReturnType<typeof legacyMediaHarness>["api"]
    | null,
  document: ReturnType<typeof documentHarness>["api"],
): void {
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", media ? { matchMedia: vi.fn(() => media) } : {});
}

function storageHarness(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    api: {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        values.set(key, value);
      }),
    },
  };
}

function documentHarness() {
  const toggleDark = vi.fn();
  return {
    toggleDark,
    api: {
      documentElement: {
        classList: {
          toggle: toggleDark,
        },
      },
    },
  };
}

function modernMediaHarness(initialDark: boolean) {
  let dark = initialDark;
  let listener: (() => void) | null = null;
  const addEventListener = vi.fn((_event: string, nextListener: () => void) => {
    listener = nextListener;
  });
  const removeEventListener = vi.fn();
  return {
    api: {
      get matches() {
        return dark;
      },
      addEventListener,
      removeEventListener,
    },
    addEventListener,
    removeEventListener,
    emit(nextDark: boolean) {
      dark = nextDark;
      listener?.();
    },
  };
}

function legacyMediaHarness(initialDark: boolean) {
  let dark = initialDark;
  let listener: (() => void) | null = null;
  const addListener = vi.fn((nextListener: () => void) => {
    listener = nextListener;
  });
  const removeListener = vi.fn();
  return {
    api: {
      get matches() {
        return dark;
      },
      addListener,
      removeListener,
    },
    addListener,
    removeListener,
    emit(nextDark: boolean) {
      dark = nextDark;
      listener?.();
    },
  };
}
