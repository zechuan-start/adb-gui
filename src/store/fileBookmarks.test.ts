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

const STORAGE_KEY = "adb-gui-file-bookmarks";

function persisted(): unknown {
  return JSON.parse(storage.getItem(STORAGE_KEY) ?? "null");
}

describe("useFileBookmarkStore", () => {
  beforeEach(() => {
    storage.clear();
    vi.resetModules();
  });

  it("starts empty", async () => {
    const { useFileBookmarkStore } = await import("@/store/fileBookmarks");

    expect(useFileBookmarkStore.getState().bookmarks).toEqual([]);
  });

  it("persists additions, colors and removals under its own key", async () => {
    const { useFileBookmarkStore } = await import("@/store/fileBookmarks");
    const store = useFileBookmarkStore.getState();

    store.addBookmark("/sdcard/DCIM");
    store.addBookmark("/sdcard/Download");
    store.setBookmarkColor("/sdcard/DCIM", "orange");
    store.removeBookmark("/sdcard/Download");

    expect(persisted()).toEqual({
      state: { bookmarks: [{ path: "/sdcard/DCIM", color: "orange" }] },
      version: 1,
    });
    expect(storage.getItem("adb-gui-settings")).toBeNull();
    expect(storage.getItem("adb-gui-ui")).toBeNull();
  });

  it("restores bookmarks in their saved order after a restart", async () => {
    const first = await import("@/store/fileBookmarks");
    first.useFileBookmarkStore.getState().addBookmark("/sdcard/Music");
    first.useFileBookmarkStore.getState().addBookmark("/sdcard/DCIM");
    first.useFileBookmarkStore.getState().setBookmarkColor("/sdcard/DCIM", "pink");

    vi.resetModules();
    const { useFileBookmarkStore } = await import("@/store/fileBookmarks");

    expect(useFileBookmarkStore.getState().bookmarks).toEqual([
      { path: "/sdcard/Music", color: null },
      { path: "/sdcard/DCIM", color: "pink" },
    ]);
  });

  it("reconciles damaged stored data instead of failing", async () => {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: {
          bookmarks: [
            { path: "/sdcard//DCIM/", color: "orange" },
            { path: "relative", color: "blue" },
            { path: "/sdcard/DCIM", color: "lime" },
            { path: "/sdcard/Music", color: "purple" },
          ],
        },
        version: 1,
      }),
    );
    const { useFileBookmarkStore } = await import("@/store/fileBookmarks");

    expect(useFileBookmarkStore.getState().bookmarks).toEqual([
      { path: "/sdcard/DCIM", color: "orange" },
      { path: "/sdcard/Music", color: null },
    ]);
  });

  it("starts empty when the stored list is not an array", async () => {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { bookmarks: "/sdcard/DCIM" }, version: 1 }),
    );
    const { useFileBookmarkStore } = await import("@/store/fileBookmarks");

    expect(useFileBookmarkStore.getState().bookmarks).toEqual([]);
  });

  it("does not notify subscribers for a no-op change", async () => {
    const { useFileBookmarkStore } = await import("@/store/fileBookmarks");
    useFileBookmarkStore.getState().addBookmark("/sdcard/DCIM");
    const listener = vi.fn();
    const unsubscribe = useFileBookmarkStore.subscribe(listener);

    useFileBookmarkStore.getState().addBookmark("/sdcard/DCIM");
    useFileBookmarkStore.getState().setBookmarkColor("/sdcard/DCIM", null);
    useFileBookmarkStore.getState().removeBookmark("/sdcard/Music");
    unsubscribe();

    expect(listener).not.toHaveBeenCalled();
  });
});
