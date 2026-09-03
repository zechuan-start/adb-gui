import { describe, expect, it, vi } from "vitest";
import { loadAppInfoSources } from "@/lib/appInfoLoader";
import type { AppInfo } from "@/lib/tauri";

function app(packageName: string): AppInfo {
  return {
    packageName,
    appName: packageName,
    versionName: "1",
    versionCode: 1,
    icon: "",
    firstInstallTime: 1,
    lastUpdateTime: 1,
    apkSize: 1,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function callbacks(events: string[]) {
  return {
    onCacheRead: () => events.push("cache-read"),
    onOptimisticCache: () => events.push("cache-screen"),
    onFresh: () => events.push("fresh-screen"),
  };
}

describe("loadAppInfoSources", () => {
  it("shows an early cache snapshot before fresh metadata replaces it", async () => {
    const cache = deferred<AppInfo[]>();
    const fresh = deferred<AppInfo[]>();
    const events: string[] = [];
    const loading = loadAppInfoSources({
      readCache: () => cache.promise,
      readFresh: () => fresh.promise,
      isCurrent: () => true,
      ...callbacks(events),
    });

    cache.resolve([app("cached")]);
    await vi.waitFor(() => {
      expect(events).toEqual(["cache-read", "cache-screen"]);
    });
    fresh.resolve([app("fresh")]);

    await expect(loading).resolves.toMatchObject({ status: "fresh" });
    expect(events).toEqual(["cache-read", "cache-screen", "fresh-screen"]);
  });

  it("never lets a late cache snapshot overwrite fresh metadata", async () => {
    const cache = deferred<AppInfo[]>();
    const fresh = deferred<AppInfo[]>();
    const events: string[] = [];
    const loading = loadAppInfoSources({
      readCache: () => cache.promise,
      readFresh: () => fresh.promise,
      isCurrent: () => true,
      ...callbacks(events),
    });

    fresh.resolve([app("fresh")]);
    await vi.waitFor(() => {
      expect(events).toEqual(["fresh-screen"]);
    });
    cache.resolve([app("cached")]);

    await expect(loading).resolves.toMatchObject({ status: "fresh" });
    expect(events).toEqual(["fresh-screen", "cache-read"]);
  });

  it("returns late cache data after a fresh read failure without optimistic replay", async () => {
    const cache = deferred<AppInfo[]>();
    const fresh = deferred<AppInfo[]>();
    const events: string[] = [];
    const loading = loadAppInfoSources({
      readCache: () => cache.promise,
      readFresh: () => fresh.promise,
      isCurrent: () => true,
      ...callbacks(events),
    });

    fresh.reject(new Error("offline"));
    await Promise.resolve();
    cache.resolve([app("cached")]);

    await expect(loading).resolves.toMatchObject({
      status: "failed",
      cached: [expect.objectContaining({ packageName: "cached" })],
    });
    expect(events).toEqual(["cache-read"]);
  });

  it("suppresses every callback after the request becomes stale", async () => {
    const cache = deferred<AppInfo[]>();
    const fresh = deferred<AppInfo[]>();
    const events: string[] = [];
    let current = true;
    const loading = loadAppInfoSources({
      readCache: () => cache.promise,
      readFresh: () => fresh.promise,
      isCurrent: () => current,
      ...callbacks(events),
    });

    current = false;
    cache.resolve([app("cached")]);
    fresh.resolve([app("fresh")]);

    await expect(loading).resolves.toEqual({ status: "stale" });
    expect(events).toEqual([]);
  });
});
