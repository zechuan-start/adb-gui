import type { Messages, Locale } from "@/i18n";
import { dateTime } from "@/i18n/format";
import type { AppErrorPayload } from "@/i18n/errors";
import type {
  DeviceDirectoryListing,
  DeviceFileEntry,
  DeviceImagePreview,
} from "@/lib/tauri";
import type { FilePreferences } from "@/lib/settings";

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function projectDeviceFiles(entries: DeviceFileEntry[], preferences: FilePreferences): DeviceFileEntry[] {
  return entries.filter((entry) => preferences.showHidden || !entry.name.startsWith(".")).sort((left, right) => {
    const leftDir = left.kind === "directory";
    const rightDir = right.kind === "directory";
    if (preferences.directoriesFirst && leftDir !== rightDir) return leftDir ? -1 : 1;
    const name = compareText(left.name.toLowerCase(), right.name.toLowerCase()) || compareText(left.name, right.name);
    const tie = name || compareText(left.path, right.path);
    const direction = preferences.sortDirection === "asc" ? 1 : -1;
    if (preferences.sortBy === "name") return name * direction || compareText(left.path, right.path);
    if (preferences.sortBy === "size") {
      if (leftDir !== rightDir) return leftDir ? 1 : -1;
      if (leftDir) return tie;
      return (left.size - right.size) * direction || tie;
    }
    return (left.modified_at - right.modified_at) * direction || tie;
  });
}

export interface DeviceBreadcrumb {
  label: string;
  path: string;
}

export interface DeviceOperationContext {
  serial: string | null;
  revision: number;
}

export type DeviceTransferKind = "upload" | "download";
export type DeviceTransferItemStatus = "pending" | "active" | "success" | "error";

export interface DeviceTransferItem {
  sourcePath: string;
  name: string;
  status: DeviceTransferItemStatus;
  resultName: string;
  targetPath: string;
  error: AppErrorPayload | null;
}

export interface DeviceTransferBatch {
  kind: DeviceTransferKind;
  status: "running" | "finished";
  items: DeviceTransferItem[];
}

interface DevicePreviewState {
  requestId: number;
  loading: boolean;
  data: DeviceImagePreview | null;
  error: AppErrorPayload | null;
}

export interface DeviceFileManagerState {
  serial: string | null;
  path: string;
  parent: string | null;
  pathDraft: string;
  entries: DeviceFileEntry[];
  selectedPath: string | null;
  listRequestId: number;
  listLoading: boolean;
  listError: AppErrorPayload | null;
  preview: DevicePreviewState;
  transfer: DeviceTransferBatch | null;
}

export type DeviceFileManagerAction =
  | { type: "reset"; serial: string | null }
  | { type: "set-path-draft"; value: string }
  | { type: "list-start"; serial: string; requestId: number }
  | {
      type: "list-success";
      serial: string;
      requestId: number;
      listing: DeviceDirectoryListing;
    }
  | { type: "list-error"; serial: string; requestId: number; error: AppErrorPayload }
  | { type: "select"; path: string | null }
  | { type: "preview-start"; serial: string; requestId: number; path: string }
  | {
      type: "preview-success";
      serial: string;
      requestId: number;
      path: string;
      data: DeviceImagePreview;
    }
  | {
      type: "preview-error";
      serial: string;
      requestId: number;
      path: string;
      error: AppErrorPayload | null;
    }
  | {
      type: "transfer-start";
      serial: string;
      kind: DeviceTransferKind;
      items: { sourcePath: string; name: string }[];
    }
  | { type: "transfer-item-active"; serial: string; index: number }
  | {
      type: "transfer-item-success";
      serial: string;
      index: number;
      resultName: string;
      targetPath: string;
    }
  | { type: "transfer-item-error"; serial: string; index: number; error: AppErrorPayload }
  | { type: "transfer-finish"; serial: string };

export function createDeviceFileManagerState(serial: string | null): DeviceFileManagerState {
  return {
    serial,
    path: "",
    parent: null,
    pathDraft: "",
    entries: [],
    selectedPath: null,
    listRequestId: 0,
    listLoading: false,
    listError: null,
    preview: emptyPreview(),
    transfer: null,
  };
}

export function updateDeviceOperationContext(
  context: DeviceOperationContext,
  serial: string | null,
): DeviceOperationContext {
  if (context.serial === serial) {
    return context;
  }
  return { serial, revision: context.revision + 1 };
}

export function invalidateDeviceOperationContext(
  context: DeviceOperationContext,
): DeviceOperationContext {
  return { serial: null, revision: context.revision + 1 };
}

export function isDeviceOperationContextCurrent(
  current: DeviceOperationContext,
  captured: DeviceOperationContext,
): boolean {
  return (
    captured.serial !== null &&
    current.serial === captured.serial &&
    current.revision === captured.revision
  );
}

export function deviceFileManagerReducer(
  state: DeviceFileManagerState,
  action: DeviceFileManagerAction,
): DeviceFileManagerState {
  switch (action.type) {
    case "reset":
      return createDeviceFileManagerState(action.serial);
    case "set-path-draft":
      return { ...state, pathDraft: action.value };
    case "list-start":
      if (action.serial !== state.serial || action.requestId < state.listRequestId) {
        return state;
      }
      return {
        ...state,
        listRequestId: action.requestId,
        listLoading: true,
        listError: null,
      };
    case "list-success":
      if (!matchesListRequest(state, action.serial, action.requestId)) {
        return state;
      }
      return {
        ...state,
        path: action.listing.path,
        parent: action.listing.parent,
        pathDraft: action.listing.path,
        entries: action.listing.entries,
        selectedPath: null,
        listLoading: false,
        listError: null,
        preview: emptyPreview(),
      };
    case "list-error":
      if (!matchesListRequest(state, action.serial, action.requestId)) {
        return state;
      }
      return {
        ...state,
        listLoading: false,
        listError: action.error,
      };
    case "select":
      return {
        ...state,
        selectedPath: action.path,
        preview: emptyPreview(),
      };
    case "preview-start":
      if (action.serial !== state.serial || action.path !== state.selectedPath) {
        return state;
      }
      return {
        ...state,
        preview: {
          requestId: action.requestId,
          loading: true,
          data: null,
          error: null,
        },
      };
    case "preview-success":
      if (!matchesPreviewRequest(state, action.serial, action.requestId, action.path)) {
        return state;
      }
      return {
        ...state,
        preview: {
          requestId: action.requestId,
          loading: false,
          data: action.data,
          error: null,
        },
      };
    case "preview-error":
      if (!matchesPreviewRequest(state, action.serial, action.requestId, action.path)) {
        return state;
      }
      return {
        ...state,
        preview: {
          requestId: action.requestId,
          loading: false,
          data: null,
          error: action.error,
        },
      };
    case "transfer-start":
      if (action.serial !== state.serial) {
        return state;
      }
      return {
        ...state,
        transfer: {
          kind: action.kind,
          status: "running",
          items: action.items.map((item) => ({
            ...item,
            status: "pending",
            resultName: "",
            targetPath: "",
            error: null,
          })),
        },
      };
    case "transfer-item-active":
      return updateTransferItem(state, action.serial, action.index, (item) => ({
        ...item,
        status: "active",
        error: null,
      }));
    case "transfer-item-success":
      return updateTransferItem(state, action.serial, action.index, (item) => ({
        ...item,
        status: "success",
        resultName: action.resultName,
        targetPath: action.targetPath,
        error: null,
      }));
    case "transfer-item-error":
      return updateTransferItem(state, action.serial, action.index, (item) => ({
        ...item,
        status: "error",
        error: action.error,
      }));
    case "transfer-finish":
      if (action.serial !== state.serial || state.transfer?.status !== "running") {
        return state;
      }
      return {
        ...state,
        transfer: { ...state.transfer, status: "finished" },
      };
    default:
      return assertNever(action);
  }
}

export function buildDeviceBreadcrumbs(path: string): DeviceBreadcrumb[] {
  if (!path.startsWith("/")) {
    return [];
  }
  const breadcrumbs: DeviceBreadcrumb[] = [{ label: "/", path: "/" }];
  const segments = path.split("/").filter(Boolean);
  let current = "";
  for (const segment of segments) {
    current += `/${segment}`;
    breadcrumbs.push({ label: segment, path: current });
  }
  return breadcrumbs;
}

export function formatDeviceFileSize(size: number): string {
  if (!Number.isFinite(size) || size < 0) {
    return "-";
  }
  if (size < 1024) {
    return `${size} B`;
  }
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let value = size / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${unit}`;
}

export function formatDeviceModifiedAt(seconds: number, locale: Locale): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "-";
  }
  return dateTime(locale).format(new Date(seconds * 1000));
}

export function deviceFileTypeLabel(entry: DeviceFileEntry, t: Messages): string {
  switch (entry.kind) {
    case "directory":
      return t.files.kinds.directory;
    case "symlink":
      return t.files.kinds.symlink;
    case "other":
      return t.files.kinds.other;
    case "file": {
      const dotIndex = entry.name.lastIndexOf(".");
      if (dotIndex <= 0 || dotIndex === entry.name.length - 1) {
        return t.files.kinds.file;
      }
      const extension = entry.name.slice(dotIndex + 1);
      return extension.length <= 8 ? extension.toUpperCase() : t.files.kinds.file;
    }
    default:
      return assertNever(entry.kind);
  }
}

export function localFileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

export function deviceDownloadDefaultName(
  fileName: string,
  pathSeparator: string,
): string {
  if (!fileName || fileName === "." || fileName === "..") {
    return "device-file";
  }
  if (pathSeparator !== "\\") {
    return fileName;
  }

  let safeName = fileName.replace(
    /[\u0000-\u001f\u007f-\u009f<>:"\/\\|?*]/g,
    "_",
  );
  safeName = safeName.replace(/[. ]+$/g, (suffix) => "_".repeat(suffix.length));

  if (!safeName || safeName === "." || safeName === "..") {
    return "device-file";
  }
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safeName)) {
    return `_${safeName}`;
  }
  return safeName;
}

export function isDeviceTransferBusy(transfer: DeviceTransferBatch | null): boolean {
  return transfer?.status === "running";
}

export function hasLoadedDeviceDirectory(
  state: DeviceFileManagerState,
  onlineSerial: string | null,
): boolean {
  return Boolean(onlineSerial && state.serial === onlineSerial && state.path);
}

export function isDeviceDirectoryViewLoading(
  state: DeviceFileManagerState,
  onlineSerial: string | null,
): boolean {
  if (!onlineSerial) {
    return false;
  }
  if (state.serial !== onlineSerial) {
    return true;
  }
  return state.listLoading || (!state.path && !state.listError);
}

export function deviceTransferSummary(transfer: DeviceTransferBatch, t: Messages): string {
  const kind = transfer.kind;
  if (transfer.status === "running") {
    const activeIndex = transfer.items.findIndex((item) => item.status === "active");
    return activeIndex >= 0
      ? `${activeIndex + 1}/${transfer.items.length}`
      : t.files.transfer.preparing({ kind });
  }

  const successCount = transfer.items.filter((item) => item.status === "success").length;
  const failureCount = transfer.items.filter((item) => item.status === "error").length;
  if (failureCount === 0) {
    return t.files.transfer.complete({ kind });
  }
  return successCount > 0
    ? t.files.transfer.partial({ kind, succeeded: successCount, failed: failureCount })
    : t.files.transfer.failed({ kind, count: failureCount });
}

function emptyPreview(): DevicePreviewState {
  return {
    requestId: 0,
    loading: false,
    data: null,
    error: null,
  };
}

function matchesListRequest(
  state: DeviceFileManagerState,
  serial: string,
  requestId: number,
): boolean {
  return serial === state.serial && requestId === state.listRequestId;
}

function matchesPreviewRequest(
  state: DeviceFileManagerState,
  serial: string,
  requestId: number,
  path: string,
): boolean {
  return (
    serial === state.serial &&
    requestId === state.preview.requestId &&
    path === state.selectedPath
  );
}

function updateTransferItem(
  state: DeviceFileManagerState,
  serial: string,
  index: number,
  update: (item: DeviceTransferItem) => DeviceTransferItem,
): DeviceFileManagerState {
  if (
    serial !== state.serial ||
    state.transfer?.status !== "running" ||
    index < 0 ||
    index >= state.transfer.items.length
  ) {
    return state;
  }
  const items = state.transfer.items.map((item, itemIndex) =>
    itemIndex === index ? update(item) : item,
  );
  return { ...state, transfer: { ...state.transfer, items } };
}

function assertNever(value: never): never {
  throw new Error(`Unhandled device file value: ${String(value)}`);
}
