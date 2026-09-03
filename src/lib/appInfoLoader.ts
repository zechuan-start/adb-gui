import type { AppInfo } from "@/lib/tauri";

interface AppInfoSourceOptions {
  readCache: () => Promise<AppInfo[]>;
  readFresh: () => Promise<AppInfo[]>;
  isCurrent: () => boolean;
  onCacheRead: (apps: AppInfo[]) => void;
  onOptimisticCache: (apps: AppInfo[]) => void;
  onFresh: (apps: AppInfo[]) => void;
}

export type AppInfoSourceResult =
  | { status: "fresh"; fresh: AppInfo[]; cached: AppInfo[] }
  | { status: "failed"; error: unknown; cached: AppInfo[] }
  | { status: "stale" };

export async function loadAppInfoSources(
  options: AppInfoSourceOptions,
): Promise<AppInfoSourceResult> {
  let phase1Done = false;
  const cachePromise = Promise.resolve()
    .then(options.readCache)
    .catch(() => [] as AppInfo[])
    .then((cached) => {
      if (options.isCurrent()) {
        options.onCacheRead(cached);
        if (!phase1Done && cached.length > 0) {
          options.onOptimisticCache(cached);
        }
      }
      return cached;
    });
  const freshPromise = Promise.resolve().then(options.readFresh);

  try {
    const fresh = await freshPromise;
    phase1Done = true;
    if (!options.isCurrent()) {
      return { status: "stale" };
    }
    options.onFresh(fresh);
    const cached = await cachePromise;
    if (!options.isCurrent()) {
      return { status: "stale" };
    }
    return { status: "fresh", fresh, cached };
  } catch (error) {
    phase1Done = true;
    const cached = await cachePromise;
    if (!options.isCurrent()) {
      return { status: "stale" };
    }
    return { status: "failed", error, cached };
  }
}
