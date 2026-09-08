import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let loaded: typeof import("./locale") | undefined;
beforeEach(() => vi.resetModules());
afterEach(() => {
  loaded?.disposeLocaleListener();
  loaded = undefined;
  vi.unstubAllGlobals();
});

function browser(initial: string | null = null) {
  const values = new Map<string, string>(initial === null ? [] : [["locale", initial]]);
  let languages = ["zh-CN"];
  const target = new EventTarget();
  const root = { lang: "" };
  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
  };
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("navigator", { get languages() { return languages; } });
  vi.stubGlobal("document", { documentElement: root });
  vi.stubGlobal("window", target);
  return { values, root, storage, change: (next: string[]) => {
    languages = next;
    target.dispatchEvent(new Event("languagechange"));
  } };
}

async function load() {
  loaded = await import("./locale");
  return loaded.useLocaleStore;
}

describe("language preference", () => {
  it("applies system language before rendering and repairs invalid storage", async () => {
    const env = browser("fr");
    const store = await load();
    expect(store.getState().preference).toBe("system");
    expect(env.root.lang).toBe("zh-CN");
    expect(env.values.get("locale")).toBe("system");
  });

  it("follows changes only in system mode and preserves the explicit preference", async () => {
    const env = browser();
    const store = await load();
    env.change(["fr"]);
    expect(store.getState().locale).toBe("en");
    store.getState().setPreference("zh-CN");
    env.change(["ja"]);
    expect(store.getState().locale).toBe("zh-CN");
    expect(env.root.lang).toBe("zh-CN");
    expect(env.values.get("locale")).toBe("zh-CN");
    store.getState().setPreference("system");
    expect(store.getState().locale).toBe("en");
    expect(store.getState().messages.settings.general.language.label).toBe("Language");
    loaded?.disposeLocaleListener();
    env.change(["zh"]);
    expect(store.getState().locale).toBe("en");
  });

  it("retains an explicit choice across reload without persisting runtime data", async () => {
    const env = browser("en");
    const store = await load();
    expect(env.root.lang).toBe("en");
    store.getState().setPreference("zh-CN");
    loaded?.disposeLocaleListener();
    vi.resetModules();
    expect((await load()).getState().preference).toBe("zh-CN");
    expect([...env.values.keys()]).toEqual(["locale"]);
  });

  it("keeps the control usable when storage is unreadable or unwritable", async () => {
    const env = browser();
    env.storage.getItem.mockImplementation(() => { throw new Error("denied"); });
    env.storage.setItem.mockImplementation(() => { throw new Error("quota"); });
    const store = await load();
    expect(() => store.getState().setPreference("en")).not.toThrow();
    expect(store.getState().locale).toBe("en");
    expect(env.root.lang).toBe("en");
  });
});
