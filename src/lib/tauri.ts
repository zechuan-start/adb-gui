
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { downloadDir, join, sep } from "@tauri-apps/api/path";
import { readImage } from "@tauri-apps/plugin-clipboard-manager";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openPath, openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { getCurrentWebview, type DragDropEvent } from "@tauri-apps/api/webview";
import { SUPPORTED_IMAGE_EXTENSIONS } from "@/lib/codeDecoder";
import { deviceDownloadDefaultName } from "@/lib/deviceFiles";
import type { LogLevel } from "@/lib/logcat";

export interface DeviceInfo {
  serial: string;
  state: string;
  model: string;
  transport: string;
  is_network: boolean;
  alias_identity: string | null;
  device_id: string | null;
}

export interface AdbInfo {
  path: string;
  version: string;
  source: string;
}

export interface PackageInfo {
  name: string;
  label: string | null;
}

export interface AppInfo {
  packageName: string;
  appName: string;
  versionName: string;
  versionCode: number;
  icon: string;
  firstInstallTime: number;
  lastUpdateTime: number;
  apkSize: number;
}

export interface AppIconEntry {
  packageName: string;
  icon: string;
}

export interface LogcatLine {
  time: string;
  level: LogLevel;
  tag: string;
  pid: string;
  tid: string;
  message: string;
  raw: string;
}

export interface ProcessEntry {
  pid: string;
  name: string;
}

export interface LogcatSessionInfo {
  serial: string;
  session_id: number;
}

export interface LogcatBatch {
  serial: string;
  session_id: number;
  lines: LogcatLine[];
}

export interface LogcatExit {
  serial: string;
  session_id: number;
  reason: "eof" | "error";
  detail: string;
}

export interface ScreenshotResult {
  path: string;
  opened: boolean;
  revealed: boolean;
}

export interface ExportLogcatResult {
  path: string;
  revealed: boolean;
}

export interface DeviceDetail {
  model: string;
  manufacturer: string;
  android_version: string;
  sdk_level: string;
  abi: string;
  resolution: string;
  density: string;
  battery_level: string;
  battery_status: string;
}

export interface ForwardRule {
  direction: "forward" | "reverse";
  local_port: string;
  remote_port: string;
  raw: string;
}

export interface ScreenRecordStatus {
  active: boolean;
  serial: string | null;
  elapsed_secs: number;
  pending_pull: boolean;
}

export interface ScreenRecordResult {
  path: string;
  opened: boolean;
}

export function isTauriRuntime(): boolean {
  return isTauri();
}

export interface QuickReportResult {
  dir: string;
  revealed: boolean;
}

export interface BugreportResult {
  path: string;
  revealed: boolean;
}

export type DeviceFileKind = "directory" | "file" | "symlink" | "other";

export interface DeviceFileEntry {
  name: string;
  path: string;
  kind: DeviceFileKind;
  size: number;
  modified_at: number;
  previewable: boolean;
}

export interface DeviceDirectoryListing {
  path: string;
  parent: string | null;
  entries: DeviceFileEntry[];
}

export interface DeviceTransferResult {
  name: string;
  remote_path: string;
  local_path: string | null;
}

export interface DeviceImagePreview {
  data_url: string;
  mime_type: string;
  size: number;
}

export type KeyAction =
  | "back"
  | "home"
  | "recents"
  | "enter"
  | "delete"
  | "power"
  | "volume-up"
  | "volume-down";

export async function getAdbInfo(): Promise<AdbInfo> {
  return invoke<AdbInfo>("get_adb_info");
}

export async function listDevices(): Promise<DeviceInfo[]> {
  return invoke<DeviceInfo[]>("list_devices");
}

export async function getCurrentActivity(serial: string): Promise<string> {
  return invoke<string>("get_current_activity", { serial });
}

export async function installApk(serial: string, apkPath: string): Promise<string> {
  return invoke<string>("install_apk", { serial, apkPath });
}

export async function listDeviceDirectory(
  serial: string,
  path: string | null = null,
): Promise<DeviceDirectoryListing> {
  return invoke<DeviceDirectoryListing>("list_device_directory", { serial, path });
}

export async function createDeviceDirectory(
  serial: string,
  parentPath: string,
  name: string,
): Promise<DeviceFileEntry> {
  return invoke<DeviceFileEntry>("create_device_directory", { serial, parentPath, name });
}

export async function uploadDeviceFile(
  serial: string,
  localPath: string,
  remoteDir: string,
): Promise<DeviceTransferResult> {
  return invoke<DeviceTransferResult>("upload_device_file", { serial, localPath, remoteDir });
}

export async function downloadDeviceFile(
  serial: string,
  remotePath: string,
  localPath: string,
): Promise<DeviceTransferResult> {
  return invoke<DeviceTransferResult>("download_device_file", { serial, remotePath, localPath });
}

export async function previewDeviceImage(
  serial: string,
  remotePath: string,
): Promise<DeviceImagePreview> {
  return invoke<DeviceImagePreview>("preview_device_image", { serial, remotePath });
}

export async function sendKey(serial: string, action: KeyAction): Promise<string> {
  return invoke<string>("send_key_event", { serial, action });
}

export async function forceStopApp(serial: string, pkg: string): Promise<string> {
  return invoke<string>("force_stop_app", { serial, pkg });
}

export async function clearAppData(serial: string, pkg: string): Promise<string> {
  return invoke<string>("clear_app_data", { serial, pkg });
}

export async function launchApp(serial: string, pkg: string): Promise<string> {
  return invoke<string>("launch_app", { serial, pkg });
}

export async function uninstallApp(serial: string, pkg: string): Promise<string> {
  return invoke<string>("uninstall_app", { serial, pkg });
}

export async function takeScreenshot(serial: string): Promise<ScreenshotResult> {
  return invoke<ScreenshotResult>("take_screenshot", { serial });
}

export async function pickApkFile(): Promise<string | null> {
  const selected = await open({
    title: "Select APK",
    multiple: false,
    filters: [{ name: "APK", extensions: ["apk"] }],
  });
  return typeof selected === "string" ? selected : null;
}

export async function pickDeviceUploadFiles(): Promise<string[]> {
  const selected = await open({
    title: "选择要上传到设备的文件",
    multiple: true,
    directory: false,
  });
  if (Array.isArray(selected)) {
    return selected;
  }
  return typeof selected === "string" ? [selected] : [];
}

export async function readImageFile(path: string): Promise<Uint8Array> {
  return new Uint8Array(await invoke<ArrayBuffer>("read_image_file", { path }));
}

export async function pickImageFiles(): Promise<string[]> {
  const selected = await open({
    title: "选择要解码的图片",
    multiple: true,
    directory: false,
    filters: [
      {
        name: "图片",
        extensions: [...SUPPORTED_IMAGE_EXTENSIONS],
      },
    ],
  });
  if (Array.isArray(selected)) {
    return selected;
  }
  return typeof selected === "string" ? [selected] : [];
}

export async function readClipboardImage(): Promise<ImageData | null> {
  let image: Awaited<ReturnType<typeof readImage>>;
  try {
    image = await readImage();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message
        .toLowerCase()
        .includes("clipboard contents were not available in the requested format")
    ) {
      return null;
    }
    throw error;
  }

  try {
    const [rgba, { width, height }] = await Promise.all([image.rgba(), image.size()]);
    const expectedLength = width * height * 4;
    if (!Number.isSafeInteger(expectedLength) || rgba.length !== expectedLength) {
      throw new Error(
        `剪贴板图片像素数据长度不匹配: 期望 ${expectedLength}, 实际 ${rgba.length}`,
      );
    }
    return new ImageData(new Uint8ClampedArray(rgba), width, height);
  } finally {
    await image.close();
  }
}

export async function openUrlExternal(url: string): Promise<void> {
  await openUrl(url);
}

export async function pickDeviceDownloadPath(fileName: string): Promise<string | null> {
  const defaultName = deviceDownloadDefaultName(fileName, sep());
  const defaultPath = await join(await downloadDir(), defaultName);
  return save({
    title: "保存设备文件",
    defaultPath,
  });
}

export async function openFile(path: string): Promise<void> {
  await openPath(path);
}

export async function revealFile(path: string): Promise<void> {
  await revealItemInDir(path);
}

export async function onDevicesUpdated(callback: (devices: DeviceInfo[]) => void): Promise<UnlistenFn> {
  return listen<DeviceInfo[]>("devices-updated", (e) => callback(e.payload));
}

export async function getDeviceInfo(serial: string): Promise<DeviceDetail> {
  return invoke<DeviceDetail>("get_device_info", { serial });
}

export async function listPackages(serial: string): Promise<string[]> {
  return invoke<string[]>("list_packages", { serial });
}

export async function getInstalledApps(serial: string): Promise<AppInfo[]> {
  return invoke<AppInfo[]>("get_installed_apps", { serial });
}

export async function getInstalledAppIcons(
  serial: string,
  packages?: string[],
): Promise<AppIconEntry[]> {
  return invoke<AppIconEntry[]>("get_installed_app_icons", { serial, packages });
}

export async function readAppInfoCache(deviceKey: string): Promise<AppInfo[]> {
  return invoke<AppInfo[]>("read_app_info_cache", { deviceKey });
}

export async function writeAppInfoCache(
  deviceKey: string,
  apps: AppInfo[],
  newIcons: AppIconEntry[],
): Promise<void> {
  return invoke<void>("write_app_info_cache", { deviceKey, apps, newIcons });
}

export async function getAppIcon(serial: string, pkg: string): Promise<string> {
  return invoke<string>("get_app_icon", { serial, pkg });
}

export async function startLogcat(serial: string): Promise<LogcatSessionInfo> {
  return invoke<LogcatSessionInfo>("start_logcat", { serial });
}

export async function stopLogcat(serial: string, sessionId: number): Promise<void> {
  return invoke<void>("stop_logcat", { serial, sessionId });
}

export async function clearLogcat(serial: string): Promise<void> {
  return invoke<void>("clear_logcat", { serial });
}

export async function getPackagePids(serial: string, pkg: string): Promise<string[]> {
  return invoke<string[]>("get_package_pids", { serial, pkg });
}

export async function listDeviceProcesses(serial: string): Promise<ProcessEntry[]> {
  return invoke<ProcessEntry[]>("list_device_processes", { serial });
}

export async function exportLogcat(serial: string, content: string): Promise<ExportLogcatResult> {
  return invoke<ExportLogcatResult>("export_logcat", { serial, content });
}

export async function adbConnect(address: string): Promise<string> {
  return invoke<string>("adb_connect", { address });
}

export async function adbDisconnect(address: string): Promise<string> {
  return invoke<string>("adb_disconnect", { address });
}

export async function enableWifiDebugging(serial: string): Promise<string> {
  return invoke<string>("enable_wifi_debugging", { serial });
}

export async function openDeepLink(serial: string, url: string): Promise<string> {
  return invoke<string>("open_deep_link", { serial, url });
}

export async function listPortForwards(serial: string): Promise<ForwardRule[]> {
  return invoke<ForwardRule[]>("list_port_forwards", { serial });
}

export async function addPortForward(
  serial: string,
  direction: ForwardRule["direction"],
  localPort: string,
  remotePort: string,
): Promise<string> {
  return invoke<string>("add_port_forward", { serial, direction, localPort, remotePort });
}

export async function removePortForward(
  serial: string,
  direction: ForwardRule["direction"],
  port: string,
): Promise<string> {
  return invoke<string>("remove_port_forward", { serial, direction, port });
}

export async function startScreenRecord(serial: string): Promise<ScreenRecordStatus> {
  return invoke<ScreenRecordStatus>("start_screen_record", { serial });
}

export async function stopScreenRecord(): Promise<ScreenRecordResult> {
  return invoke<ScreenRecordResult>("stop_screen_record");
}

export async function getScreenRecordStatus(): Promise<ScreenRecordStatus> {
  return invoke<ScreenRecordStatus>("get_screen_record_status");
}

export async function collectQuickBugReport(serial: string): Promise<QuickReportResult> {
  return invoke<QuickReportResult>("collect_quick_bug_report", { serial });
}

export async function collectFullBugreport(serial: string): Promise<BugreportResult> {
  return invoke<BugreportResult>("collect_full_bugreport", { serial });
}

export async function onLogcatBatch(callback: (batch: LogcatBatch) => void): Promise<UnlistenFn> {
  return listen<LogcatBatch>("logcat-batch", (e) => callback(e.payload));
}

export async function onLogcatExit(callback: (exit: LogcatExit) => void): Promise<UnlistenFn> {
  return listen<LogcatExit>("logcat-exit", (e) => callback(e.payload));
}

export async function onDragDrop(callback: (event: DragDropEvent) => void): Promise<UnlistenFn> {
  return getCurrentWebview().onDragDropEvent((event) => {
    callback(event.payload);
  });
}
