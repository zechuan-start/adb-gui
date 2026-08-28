import type {
  DeviceDirectoryListing,
  DeviceFileEntry,
  DeviceImagePreview,
} from "@/lib/tauri";

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
  error: string;
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
  error: string;
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
  listError: string;
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
  | { type: "list-error"; serial: string; requestId: number; error: string }
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
      error: string;
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
  | { type: "transfer-item-error"; serial: string; index: number; error: string }
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
    listError: "",
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
        listError: "",
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
        listError: "",
        preview: emptyPreview(),
      };
    case "list-error":
      if (!matchesListRequest(state, action.serial, action.requestId)) {
        return state;
      }
      return {
        ...state,
        pathDraft: state.path,
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
          error: "",
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
          error: "",
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
            error: "",
          })),
        },
      };
    case "transfer-item-active":
      return updateTransferItem(state, action.serial, action.index, (item) => ({
        ...item,
        status: "active",
        error: "",
      }));
    case "transfer-item-success":
      return updateTransferItem(state, action.serial, action.index, (item) => ({
        ...item,
        status: "success",
        resultName: action.resultName,
        targetPath: action.targetPath,
        error: "",
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

export function formatDeviceModifiedAt(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "-";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(seconds * 1000));
}

export function deviceFileTypeLabel(entry: DeviceFileEntry): string {
  switch (entry.kind) {
    case "directory":
      return "文件夹";
    case "symlink":
      return "链接";
    case "other":
      return "其他";
    case "file": {
      const dotIndex = entry.name.lastIndexOf(".");
      if (dotIndex <= 0 || dotIndex === entry.name.length - 1) {
        return "文件";
      }
      const extension = entry.name.slice(dotIndex + 1);
      return extension.length <= 8 ? extension.toUpperCase() : "文件";
    }
    default:
      return assertNever(entry.kind);
  }
}

export function localFileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
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

export function deviceTransferSummary(transfer: DeviceTransferBatch): string {
  const action = transfer.kind === "upload" ? "上传" : "下载";
  if (transfer.status === "running") {
    const activeIndex = transfer.items.findIndex((item) => item.status === "active");
    return activeIndex >= 0
      ? `${activeIndex + 1}/${transfer.items.length}`
      : `准备${action}`;
  }

  const successCount = transfer.items.filter((item) => item.status === "success").length;
  const failureCount = transfer.items.filter((item) => item.status === "error").length;
  if (failureCount === 0) {
    return `${action}完成`;
  }
  return successCount > 0
    ? `${action}: ${successCount} 个成功, ${failureCount} 个失败`
    : `${action}失败: ${failureCount} 个`;
}

function emptyPreview(): DevicePreviewState {
  return {
    requestId: 0,
    loading: false,
    data: null,
    error: "",
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
