import type { AppIconEntry, AppInfo } from "@/lib/tauri";

const APP_NAME_COLLATOR = new Intl.Collator("zh-CN", {
  numeric: true,
  sensitivity: "base",
});

export function appDisplayName(app: AppInfo): string {
  return app.appName.trim() || app.packageName;
}

export function fallbackAppInfo(packageName: string): AppInfo {
  return {
    packageName,
    appName: packageName,
    versionName: "",
    versionCode: 0,
    icon: "",
    firstInstallTime: 0,
    lastUpdateTime: 0,
    apkSize: 0,
  };
}

export function sortAppInfo(apps: AppInfo[]): AppInfo[] {
  return [...apps].sort((left, right) => {
    const byName = APP_NAME_COLLATOR.compare(appDisplayName(left), appDisplayName(right));
    return byName || left.packageName.localeCompare(right.packageName);
  });
}

export function filterAppInfo(apps: AppInfo[], query: string): AppInfo[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) {
    return apps;
  }
  return apps.filter(
    (app) =>
      appDisplayName(app).toLocaleLowerCase().includes(normalized) ||
      app.packageName.toLocaleLowerCase().includes(normalized),
  );
}

export function chunkPackages(packages: string[], size: number): string[][] {
  if (!Number.isInteger(size) || size <= 0) {
    throw new RangeError("Package chunk size must be a positive integer.");
  }

  const chunks: string[][] = [];
  for (let index = 0; index < packages.length; index += size) {
    chunks.push(packages.slice(index, index + size));
  }
  return chunks;
}

export function hasUnrequestedPackages(
  entries: AppIconEntry[],
  requestedPackages: string[],
): boolean {
  const requested = new Set(requestedPackages);
  return entries.some((entry) => !requested.has(entry.packageName));
}

export function appIconKey(packageName: string, lastUpdateTime: number): string {
  return `${packageName}\0${lastUpdateTime}`;
}

export function missingIconPackages(
  fresh: AppInfo[],
  cachedIcons: Map<string, string>,
): string[] {
  const missing = new Set<string>();
  for (const app of fresh) {
    const cached = cachedIcons.get(appIconKey(app.packageName, app.lastUpdateTime));
    if (app.lastUpdateTime <= 0 || !cached) {
      missing.add(app.packageName);
    }
  }
  return [...missing];
}
