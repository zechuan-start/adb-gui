import type { AppInfo } from "@/lib/tauri";

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
