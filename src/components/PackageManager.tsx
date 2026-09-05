import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Box, Play, RefreshCw, Search, Square, Trash2 } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  appDisplayName,
  appIconKey,
  chunkPackages,
  fallbackAppInfo,
  filterAppInfo,
  hasUnrequestedPackages,
  missingIconPackages,
  sortAppInfo,
} from "@/lib/appInfo";
import { loadAppInfoSources } from "@/lib/appInfoLoader";
import { deviceCacheKey, getDeviceBySerial, isOnlineDevice } from "@/lib/device";
import { formatDeviceFileSize, formatDeviceModifiedAt } from "@/lib/deviceFiles";
import {
  clearAppData,
  forceStopApp,
  getAppIcon,
  getInstalledAppIcons,
  getInstalledApps,
  launchApp,
  listPackages,
  readAppInfoCache,
  uninstallApp,
  writeAppInfoCache,
} from "@/lib/tauri";
import type { AppIconEntry, AppInfo } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { useDeviceStore } from "@/store/device";
import { useFeedbackStore } from "@/store/feedback";
import { useSettingsStore } from "@/store/settings";
import { SortPreferences } from "@/components/settings/SortPreferences";

const iconCache = new Map<string, string>();
const ICON_BATCH_SIZE = 50;

type FallbackState = { kind: "cache" | "packages"; reason: string } | null;
type IconLoadMode = "bulk-pending" | "bulk-done" | "lazy";

function appIconCacheKey(
  deviceKey: string,
  packageName: string,
  lastUpdateTime: number,
): string {
  return `${deviceKey}\0${packageName}\0${lastUpdateTime}`;
}

function appVersionLabel(app: AppInfo): string {
  if (app.versionName) {
    return app.versionName;
  }
  return app.versionCode > 0 ? String(app.versionCode) : "-";
}

function appTimestampLabel(timestamp: number): string {
  return timestamp > 0 ? formatDeviceModifiedAt(timestamp / 1000) : "-";
}

function AppIcon({ src, size = 20 }: { src?: string; size?: number }) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className="shrink-0 border border-rule bg-surface2 object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center border border-rule bg-surface text-ink3"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Box style={{ width: size * 0.58, height: size * 0.58 }} />
    </span>
  );
}

type DestructiveAction = "clear" | "uninstall";

export function PackageManagerPanel() {
  const preferences = useSettingsStore((state) => state.preferences.apps);
  const settingsError = useSettingsStore((state) => state.error);
  const devices = useDeviceStore((state) => state.devices);
  const selectedDevice = useDeviceStore((state) => state.selectedDevice);
  const device = getDeviceBySerial(devices, selectedDevice);
  const showToast = useFeedbackStore((state) => state.showToast);
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [fallback, setFallback] = useState<FallbackState>(null);
  const [fallbackDetailsExpanded, setFallbackDetailsExpanded] = useState(false);
  const [iconLoadMode, setIconLoadMode] = useState<IconLoadMode>("bulk-pending");
  const [search, setSearch] = useState("");
  const [selectedPkg, setSelectedPkg] = useState("");
  const [confirmAction, setConfirmAction] = useState<DestructiveAction | null>(null);
  const [acting, setActing] = useState(false);
  const [icons, setIcons] = useState<Map<string, string>>(new Map());
  const parentRef = useRef<HTMLDivElement>(null);
  const loadRequestRef = useRef(0);
  const onlineSerial = device && isOnlineDevice(device) ? device.serial : null;
  const cacheDeviceKey = device ? deviceCacheKey(device) : "";
  const online = onlineSerial !== null;

  const loadApps = useCallback(async () => {
    if (!onlineSerial || !cacheDeviceKey) {
      return;
    }
    const serial = onlineSerial;
    const deviceKey = cacheDeviceKey;
    const requestId = ++loadRequestRef.current;
    const isCurrent = () => loadRequestRef.current === requestId;
    const publishApps = (nextApps: AppInfo[]) => {
      setApps(nextApps);
      setSelectedPkg((current) =>
        current && nextApps.some((app) => app.packageName === current) ? current : "",
      );
    };
    const hydrateCachedIcons = (cachedApps: AppInfo[]) => {
      let changed = false;
      for (const app of cachedApps) {
        if (!app.icon) {
          continue;
        }
        iconCache.set(
          appIconCacheKey(deviceKey, app.packageName, app.lastUpdateTime),
          app.icon,
        );
        changed = true;
      }
      if (changed) {
        setIcons(new Map(iconCache));
      }
    };
    const persistCache = (freshApps: AppInfo[], newIcons: AppIconEntry[]) => {
      if (!isCurrent()) {
        return;
      }
      void writeAppInfoCache(deviceKey, freshApps, newIcons).catch((error) => {
        console.error("Failed to write application info cache", error);
      });
    };

    setLoading(true);
    setFallback(null);
    setFallbackDetailsExpanded(false);
    setIconLoadMode("bulk-pending");
    try {
      const source = await loadAppInfoSources({
        readCache: () => readAppInfoCache(deviceKey),
        readFresh: () => getInstalledApps(serial),
        isCurrent,
        onCacheRead: hydrateCachedIcons,
        onOptimisticCache: (cachedApps) => {
          publishApps(cachedApps);
          setLoading(false);
        },
        onFresh: publishApps,
      });
      if (source.status === "stale") {
        return;
      }

      if (source.status === "failed") {
        console.error("Failed to load structured application info", source.error);
        setIconLoadMode("lazy");
        if (source.cached.length > 0) {
          publishApps(source.cached);
          setFallback({ kind: "cache", reason: String(source.error) });
          return;
        }

        setFallback({ kind: "packages", reason: String(source.error) });
        try {
          const fallbackApps = (await listPackages(serial)).map(fallbackAppInfo);
          if (!isCurrent()) {
            return;
          }
          publishApps(fallbackApps);
        } catch (fallbackError) {
          if (isCurrent()) {
            showToast("error", `加载应用列表失败: ${String(fallbackError)}`);
          }
        }
        return;
      }

      const nextApps = source.fresh;
      const availableIcons = new Map<string, string>();
      for (const cached of source.cached) {
        availableIcons.set(
          appIconKey(cached.packageName, cached.lastUpdateTime),
          cached.icon,
        );
      }
      for (const app of nextApps) {
        const memoryIcon = iconCache.get(
          appIconCacheKey(deviceKey, app.packageName, app.lastUpdateTime),
        );
        if (memoryIcon !== undefined) {
          availableIcons.set(
            appIconKey(app.packageName, app.lastUpdateTime),
            memoryIcon,
          );
        }
      }

      const packages = missingIconPackages(nextApps, availableIcons);
      if (packages.length === 0) {
        setIconLoadMode("bulk-done");
        persistCache(nextApps, []);
      } else {
        void (async () => {
          const newIcons: AppIconEntry[] = [];
          const appsByPackage = new Map(nextApps.map((app) => [app.packageName, app]));
          for (const batch of chunkPackages(packages, ICON_BATCH_SIZE)) {
            if (!isCurrent()) {
              return;
            }
            let entries: AppIconEntry[];
            try {
              entries = await getInstalledAppIcons(serial, batch);
            } catch (error) {
              console.error("Failed to load an application icon batch", error);
              if (isCurrent()) {
                setIconLoadMode("lazy");
                persistCache(nextApps, newIcons);
              }
              return;
            }

            if (!isCurrent()) {
              return;
            }
            newIcons.push(...entries);
            for (const entry of entries) {
              const app = appsByPackage.get(entry.packageName);
              if (!app) {
                continue;
              }
              iconCache.set(
                appIconCacheKey(deviceKey, entry.packageName, app.lastUpdateTime),
                entry.icon,
              );
            }
            setIcons(new Map(iconCache));
            if (hasUnrequestedPackages(entries, batch)) {
              setIconLoadMode("bulk-done");
              persistCache(nextApps, newIcons);
              return;
            }
          }

          if (isCurrent()) {
            setIconLoadMode("bulk-done");
            persistCache(nextApps, newIcons);
          }
        })();
      }
    } finally {
      if (isCurrent()) {
        setLoading(false);
      }
    }
  }, [cacheDeviceKey, onlineSerial, showToast]);

  useEffect(() => {
    if (!online) {
      loadRequestRef.current += 1;
      setApps([]);
      setSelectedPkg("");
      setConfirmAction(null);
      setFallback(null);
      setFallbackDetailsExpanded(false);
      setIconLoadMode("bulk-pending");
      setLoading(false);
      return;
    }
    setApps([]);
    setSelectedPkg("");
    setConfirmAction(null);
    void loadApps();
  }, [loadApps, online]);

  const filtered = useMemo(() => {
    return sortAppInfo(filterAppInfo(apps, search), preferences);
  }, [apps, search, preferences]);

  useEffect(() => {
    if (parentRef.current) parentRef.current.scrollTop = 0;
  }, [preferences]);

  const selectedApp = useMemo(
    () => apps.find((app) => app.packageName === selectedPkg) ?? null,
    [apps, selectedPkg],
  );

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    getItemKey: (index) => filtered[index]?.packageName ?? index,
    estimateSize: () => 42,
    overscan: 20,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const visibleRangeKey = virtualItems
    .map((item) => filtered[item.index]?.packageName ?? "")
    .join("\0");

  useEffect(() => {
    if (!onlineSerial || !cacheDeviceKey || iconLoadMode !== "lazy") {
      return;
    }
    const requestId = loadRequestRef.current;
    const toLoad = virtualItems
      .map((item) => filtered[item.index])
      .filter((app): app is AppInfo => Boolean(app))
      .filter(
        (app) =>
          !iconCache.has(
            appIconCacheKey(cacheDeviceKey, app.packageName, app.lastUpdateTime),
          ),
      )
      .slice(0, 5);
    if (toLoad.length === 0) {
      return;
    }
    for (const app of toLoad) {
      iconCache.set(
        appIconCacheKey(cacheDeviceKey, app.packageName, app.lastUpdateTime),
        "",
      );
    }
    const serial = onlineSerial;
    void Promise.all(
      toLoad.map(async (app) => {
        const cacheKey = appIconCacheKey(
          cacheDeviceKey,
          app.packageName,
          app.lastUpdateTime,
        );
        try {
          iconCache.set(cacheKey, await getAppIcon(serial, app.packageName));
        } catch {
          iconCache.set(cacheKey, "");
        }
      }),
    ).then(() => {
      if (loadRequestRef.current === requestId) {
        setIcons(new Map(iconCache));
      }
    });
  }, [cacheDeviceKey, filtered, iconLoadMode, onlineSerial, visibleRangeKey, virtualItems]);

  const canAct = online && Boolean(selectedPkg) && !acting;

  async function handleAction(
    action: "force-stop" | "launch" | DestructiveAction,
  ): Promise<void> {
    if (!onlineSerial || !selectedPkg || acting) {
      return;
    }
    setActing(true);
    try {
      let result = "";
      if (action === "force-stop") {
        result = await forceStopApp(onlineSerial, selectedPkg);
      } else if (action === "launch") {
        result = await launchApp(onlineSerial, selectedPkg);
      } else if (action === "clear") {
        result = await clearAppData(onlineSerial, selectedPkg);
      } else {
        result = await uninstallApp(onlineSerial, selectedPkg);
      }
      showToast("success", result || `${selectedPkg} 操作成功`);
      if (action === "uninstall") {
        setApps((current) => current.filter((app) => app.packageName !== selectedPkg));
        setSelectedPkg("");
      }
    } catch (error) {
      showToast("error", `操作失败: ${String(error)}`);
    } finally {
      setActing(false);
      setConfirmAction(null);
    }
  }

  if (!device || !onlineSerial) {
    return (
      <div className="flex h-full items-center justify-center p-[18px]">
        <div className="flex min-h-36 w-full max-w-xl flex-col items-center justify-center border border-dashed border-rule bg-surface px-6 text-center">
          <Box className="mb-3 h-5 w-5 text-ink3" aria-hidden="true" />
          <strong className="text-sm font-semibold text-ink">应用列表不可用</strong>
          <span className="mt-1 text-xs text-ink2">连接在线设备后可浏览和管理用户应用.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_minmax(268px,32%)]">
      <section className="flex min-h-0 min-w-0 flex-col border-r border-rule bg-surface">
        <div className="flex min-h-[43px] shrink-0 flex-wrap items-center gap-2 border-b border-rule bg-surface2 px-3 py-1">
          <label className="relative min-w-0 max-w-[340px] flex-1">
            <span className="sr-only">搜索应用名称或包名</span>
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink3" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索应用名称或包名"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="h-7 w-full border border-rule bg-paper pl-8 pr-3 font-data text-[11.5px] text-ink outline-none placeholder:text-ink3"
            />
          </label>
          <SortPreferences section="apps" showSettings />
          <button
            type="button"
            onClick={() => void loadApps()}
            disabled={loading}
            className="inline-flex h-7 items-center gap-1.5 border border-rule px-2 font-data text-[10.5px] text-ink2 hover:border-ink3 hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            title="刷新应用列表"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            <span className="hidden min-[1040px]:inline">刷新</span>
          </button>
          <span className="ml-auto shrink-0 font-data text-[10.5px] text-ink3">
            {filtered.length} / {apps.length}
          </span>
        </div>

        {settingsError && <div role="alert" className="border-b border-err bg-err-band px-3 py-2 text-xs text-err">{settingsError}</div>}
        {fallback && (
          <div className="shrink-0 border-b border-warn/45 bg-warn-band px-3 py-2 text-[11px] text-warn">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                {fallback.kind === "cache"
                  ? "实时读取失败, 当前显示上次读取的数据."
                  : "应用名称和版本读取失败, 当前显示精简信息."}
              </span>
              <button
                type="button"
                onClick={() => setFallbackDetailsExpanded((expanded) => !expanded)}
                className="h-6 shrink-0 border border-warn/45 px-2 font-data text-[10px] hover:bg-hover"
              >
                {fallbackDetailsExpanded ? "收起详情" : "查看详情"}
              </button>
              <button
                type="button"
                onClick={() => void loadApps()}
                disabled={loading}
                className="h-6 shrink-0 border border-warn/45 px-2 font-data text-[10px] hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                重试
              </button>
            </div>
            {fallbackDetailsExpanded && (
              <div
                className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap break-all border-t border-warn/30 pt-2 font-data text-[10px] leading-4"
                title={fallback.reason}
              >
                {fallback.reason}
              </div>
            )}
          </div>
        )}

        <div className="grid h-7 shrink-0 grid-cols-[minmax(0,1fr)_92px] items-center border-b border-dashed border-rule px-3 font-data text-[10px] uppercase text-ink3">
          <span>应用 / 包名</span>
          <span className="text-right">版本</span>
        </div>

        <div ref={parentRef} className="min-h-0 flex-1 overflow-auto bg-log-bg/45">
          {filtered.length === 0 ? (
            <div className="flex h-full min-h-28 items-center justify-center px-5 text-center text-xs text-ink3">
              {loading
                ? "正在读取应用信息..."
                : apps.length === 0
                  ? "设备上没有可管理的用户应用."
                  : "没有匹配的应用."}
            </div>
          ) : (
            <div className="relative" style={{ height: `${virtualizer.getTotalSize()}px` }}>
              {virtualItems.map((virtualItem) => {
                const app = filtered[virtualItem.index];
                const packageName = app.packageName;
                const displayName = appDisplayName(app);
                const selected = selectedPkg === app.packageName;
                return (
                  <button
                    key={packageName}
                    type="button"
                    onClick={() => {
                      setSelectedPkg(packageName);
                      setConfirmAction(null);
                    }}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: `${virtualItem.size}px`,
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                    className={cn(
                      "relative grid grid-cols-[minmax(0,1fr)_92px] items-center border-b border-dashed border-rule2 px-3 text-left before:absolute before:inset-y-1 before:left-0 before:w-[3px]",
                      selected
                        ? "bg-hover before:bg-note"
                        : "before:bg-transparent hover:bg-hover",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <AppIcon
                        src={
                          app.icon ||
                          icons.get(
                            appIconCacheKey(
                              cacheDeviceKey,
                              packageName,
                              app.lastUpdateTime,
                            ),
                          ) ||
                          iconCache.get(
                            appIconCacheKey(
                              cacheDeviceKey,
                              packageName,
                              app.lastUpdateTime,
                            ),
                          )
                        }
                      />
                      <span className="flex min-w-0 flex-col leading-[15px]">
                        <span className="truncate text-[11.5px] font-medium text-ink" title={displayName}>
                          {displayName}
                        </span>
                        {displayName !== packageName && (
                          <span className="truncate font-data text-[9.5px] text-ink3" title={packageName}>
                            {packageName}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="truncate text-right font-data text-[10px] text-ink3" title={appVersionLabel(app)}>
                      {appVersionLabel(app)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <aside className="flex min-h-0 min-w-0 flex-col bg-surface2">
        {selectedApp ? (
          <>
            <div className="flex min-h-[74px] shrink-0 items-center gap-3 border-b border-rule px-4 py-3">
              <AppIcon
                src={
                  selectedApp.icon ||
                  icons.get(
                    appIconCacheKey(
                      cacheDeviceKey,
                      selectedApp.packageName,
                      selectedApp.lastUpdateTime,
                    ),
                  ) ||
                  iconCache.get(
                    appIconCacheKey(
                      cacheDeviceKey,
                      selectedApp.packageName,
                      selectedApp.lastUpdateTime,
                    ),
                  )
                }
                size={38}
              />
              <div className="min-w-0">
                <strong className="block truncate text-sm font-semibold text-ink" title={appDisplayName(selectedApp)}>
                  {appDisplayName(selectedApp)}
                </strong>
                <span className="mt-1 block break-all font-data text-[10.5px] leading-4 text-ink2">
                  {selectedApp.packageName}
                </span>
              </div>
            </div>
            <dl className="divide-y divide-dashed divide-rule2 px-4 font-data text-[11px]">
              <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 py-2.5">
                <dt className="text-ink3">类型</dt>
                <dd className="m-0 text-ink">用户应用</dd>
              </div>
              <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 py-2.5">
                <dt className="text-ink3">版本</dt>
                <dd className="m-0 truncate text-ink" title={appVersionLabel(selectedApp)}>
                  {appVersionLabel(selectedApp)}
                </dd>
              </div>
              <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 py-2.5">
                <dt className="text-ink3">版本代码</dt>
                <dd className="m-0 text-ink">
                  {selectedApp.versionCode > 0 ? selectedApp.versionCode : "-"}
                </dd>
              </div>
              <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 py-2.5">
                <dt className="text-ink3">首次安装</dt>
                <dd className="m-0 text-ink">{appTimestampLabel(selectedApp.firstInstallTime)}</dd>
              </div>
              <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 py-2.5">
                <dt className="text-ink3">最后更新</dt>
                <dd className="m-0 text-ink">{appTimestampLabel(selectedApp.lastUpdateTime)}</dd>
              </div>
              <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 py-2.5">
                <dt className="text-ink3">APK 大小</dt>
                <dd className="m-0 text-ink">
                  {selectedApp.apkSize > 0 ? formatDeviceFileSize(selectedApp.apkSize) : "-"}
                </dd>
              </div>
              <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 py-2.5">
                <dt className="text-ink3">设备</dt>
                <dd className="m-0 truncate text-ink" title={device.serial}>{device.serial}</dd>
              </div>
            </dl>
            <div className="mt-auto border-t border-rule p-3">
              {confirmAction ? (
                <div className="flex min-h-10 items-center gap-2 border border-err bg-err-band px-2.5 text-[11px] text-err">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    确认{confirmAction === "clear" ? "清除数据" : "卸载"}?
                  </span>
                  <button
                    type="button"
                    onClick={() => setConfirmAction(null)}
                    disabled={acting}
                    className="h-7 border border-rule px-2 font-data text-[10.5px] text-ink hover:bg-hover disabled:opacity-40"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleAction(confirmAction)}
                    disabled={acting}
                    className="h-7 border border-err bg-err px-2 font-data text-[10.5px] text-onink disabled:opacity-40"
                  >
                    {acting ? "处理中" : "确认"}
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={!canAct}
                    onClick={() => void handleAction("launch")}
                    className="inline-flex h-8 items-center justify-center gap-2 border border-rule bg-paper font-data text-[11px] text-ink hover:border-ink3 hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Play className="h-3.5 w-3.5" /> 启动
                  </button>
                  <button
                    type="button"
                    disabled={!canAct}
                    onClick={() => void handleAction("force-stop")}
                    className="inline-flex h-8 items-center justify-center gap-2 border border-rule bg-paper font-data text-[11px] text-ink hover:border-ink3 hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Square className="h-3.5 w-3.5" /> 强停
                  </button>
                  <button
                    type="button"
                    disabled={!canAct}
                    onClick={() => setConfirmAction("clear")}
                    className="inline-flex h-8 items-center justify-center gap-2 border border-err font-data text-[11px] text-err hover:bg-err-band disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <AlertTriangle className="h-3.5 w-3.5" /> 清数据
                  </button>
                  <button
                    type="button"
                    disabled={!canAct}
                    onClick={() => setConfirmAction("uninstall")}
                    className="inline-flex h-8 items-center justify-center gap-2 border border-err font-data text-[11px] text-err hover:bg-err-band disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> 卸载
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <Box className="mb-3 h-5 w-5 text-ink3" />
            <strong className="text-sm font-semibold text-ink">未选择应用</strong>
            <span className="mt-1 text-xs leading-5 text-ink3">从左侧选择一个包名查看操作.</span>
          </div>
        )}
      </aside>
    </div>
  );
}
