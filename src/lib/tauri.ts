
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { getCurrentWebview, type DragDropEvent } from "@tauri-apps/api/webview";

export interface DeviceInfo {
  serial: string;
  state: string;
  model: string;
  transport: string;
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

export interface LogcatLine {
  level: string;
  tag: string;
  pid: string;
  message: string;
  raw: string;
}

export interface ScreenshotResult {
  path: string;
  opened: boolean;
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

export async function getAppIcon(serial: string, pkg: string): Promise<string> {
  return invoke<string>("get_app_icon", { serial, pkg });
}

export async function startLogcat(serial: string): Promise<void> {
  return invoke<void>("start_logcat", { serial });
}

export async function stopLogcat(): Promise<void> {
  return invoke<void>("stop_logcat");
}

export async function onLogcatLine(callback: (line: LogcatLine) => void): Promise<UnlistenFn> {
  return listen<LogcatLine>("logcat-line", (e) => callback(e.payload));
}

export async function onDragDrop(callback: (event: DragDropEvent) => void): Promise<UnlistenFn> {
  return getCurrentWebview().onDragDropEvent((event) => {
    callback(event.payload);
  });
}
