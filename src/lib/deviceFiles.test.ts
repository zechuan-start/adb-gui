import { describe, expect, it } from "vitest";
import type { DeviceDirectoryListing, DeviceFileEntry } from "@/lib/tauri";
import {
  buildDeviceBreadcrumbs,
  createDeviceFileManagerState,
  deviceFileManagerReducer,
  deviceTransferSummary,
  deviceFileTypeLabel,
  formatDeviceFileSize,
  hasLoadedDeviceDirectory,
  invalidateDeviceOperationContext,
  isDeviceDirectoryViewLoading,
  isDeviceOperationContextCurrent,
  localFileName,
  updateDeviceOperationContext,
} from "@/lib/deviceFiles";

const imageEntry: DeviceFileEntry = {
  name: "photo.png",
  path: "/sdcard/Download/photo.png",
  kind: "file",
  size: 1024,
  modified_at: 1_700_000_000,
  previewable: true,
};

const listing: DeviceDirectoryListing = {
  path: "/sdcard/Download",
  parent: "/sdcard",
  entries: [imageEntry],
};

describe("device file helpers", () => {
  it("builds root-aware breadcrumbs", () => {
    expect(buildDeviceBreadcrumbs("/sdcard/Download")).toEqual([
      { label: "/", path: "/" },
      { label: "sdcard", path: "/sdcard" },
      { label: "Download", path: "/sdcard/Download" },
    ]);
    expect(buildDeviceBreadcrumbs("relative")).toEqual([]);
  });

  it("formats file metadata without changing path semantics", () => {
    expect(formatDeviceFileSize(0)).toBe("0 B");
    expect(formatDeviceFileSize(1536)).toBe("1.5 KiB");
    expect(deviceFileTypeLabel(imageEntry)).toBe("PNG");
    expect(deviceFileTypeLabel({ ...imageEntry, kind: "directory" })).toBe("文件夹");
    expect(localFileName("C:\\Users\\qi\\photo.png")).toBe("photo.png");
  });

  it("invalidates operation snapshots across device ABA changes and unmounts", () => {
    const firstDeviceA = { serial: "device-a", revision: 0 };
    const deviceB = updateDeviceOperationContext(firstDeviceA, "device-b");
    const secondDeviceA = updateDeviceOperationContext(deviceB, "device-a");

    expect(isDeviceOperationContextCurrent(secondDeviceA, firstDeviceA)).toBe(false);
    expect(
      isDeviceOperationContextCurrent(
        invalidateDeviceOperationContext(firstDeviceA),
        firstDeviceA,
      ),
    ).toBe(false);
    expect(updateDeviceOperationContext(firstDeviceA, "device-a")).toBe(firstDeviceA);
  });

  it("shows loading instead of an empty directory until the current device has loaded", () => {
    let state = createDeviceFileManagerState("device-a");
    state = deviceFileManagerReducer(state, {
      type: "list-start",
      serial: "device-a",
      requestId: 1,
    });
    state = deviceFileManagerReducer(state, {
      type: "list-success",
      serial: "device-a",
      requestId: 1,
      listing: { ...listing, entries: [] },
    });

    expect(hasLoadedDeviceDirectory(state, "device-a")).toBe(true);
    expect(isDeviceDirectoryViewLoading(state, "device-a")).toBe(false);
    expect(hasLoadedDeviceDirectory(state, "device-b")).toBe(false);
    expect(isDeviceDirectoryViewLoading(state, "device-b")).toBe(true);

    state = deviceFileManagerReducer(state, { type: "reset", serial: "device-b" });
    expect(hasLoadedDeviceDirectory(state, "device-b")).toBe(false);
    expect(isDeviceDirectoryViewLoading(state, "device-b")).toBe(true);
  });

  it("summarizes failed and partially failed transfers", () => {
    const items = [
      {
        sourcePath: "/tmp/a.txt",
        name: "a.txt",
        status: "success" as const,
        resultName: "a.txt",
        targetPath: "/sdcard/Download/a.txt",
        error: "",
      },
      {
        sourcePath: "/tmp/b.txt",
        name: "b.txt",
        status: "error" as const,
        resultName: "",
        targetPath: "",
        error: "permission denied",
      },
    ];

    expect(deviceTransferSummary({ kind: "upload", status: "finished", items })).toBe(
      "上传: 1 个成功, 1 个失败",
    );
    expect(
      deviceTransferSummary({
        kind: "download",
        status: "finished",
        items: [items[1]],
      }),
    ).toBe("下载失败: 1 个");
  });
});

describe("deviceFileManagerReducer", () => {
  it("loads a directory and resets all device-owned state on device change", () => {
    let state = createDeviceFileManagerState("device-a");
    state = deviceFileManagerReducer(state, {
      type: "list-start",
      serial: "device-a",
      requestId: 1,
    });
    state = deviceFileManagerReducer(state, {
      type: "list-success",
      serial: "device-a",
      requestId: 1,
      listing,
    });
    state = deviceFileManagerReducer(state, { type: "select", path: imageEntry.path });

    state = deviceFileManagerReducer(state, { type: "reset", serial: "device-b" });

    expect(state.serial).toBe("device-b");
    expect(state.path).toBe("");
    expect(state.entries).toEqual([]);
    expect(state.selectedPath).toBeNull();
    expect(state.preview.data).toBeNull();
  });

  it("ignores stale directory responses", () => {
    let state = createDeviceFileManagerState("device-a");
    state = deviceFileManagerReducer(state, {
      type: "list-start",
      serial: "device-a",
      requestId: 2,
    });
    const next = deviceFileManagerReducer(state, {
      type: "list-success",
      serial: "device-a",
      requestId: 1,
      listing,
    });

    expect(next).toBe(state);
  });

  it("ignores the previous device response after a reset", () => {
    let state = createDeviceFileManagerState("device-a");
    state = deviceFileManagerReducer(state, {
      type: "list-start",
      serial: "device-a",
      requestId: 1,
    });
    state = deviceFileManagerReducer(state, { type: "reset", serial: "device-b" });

    const next = deviceFileManagerReducer(state, {
      type: "list-success",
      serial: "device-a",
      requestId: 1,
      listing,
    });

    expect(next).toBe(state);
    expect(next.entries).toEqual([]);
  });

  it("keeps the loaded directory when navigation fails", () => {
    let state = createDeviceFileManagerState("device-a");
    state = deviceFileManagerReducer(state, {
      type: "list-start",
      serial: "device-a",
      requestId: 1,
    });
    state = deviceFileManagerReducer(state, {
      type: "list-success",
      serial: "device-a",
      requestId: 1,
      listing,
    });
    state = deviceFileManagerReducer(state, { type: "set-path-draft", value: "/data" });
    state = deviceFileManagerReducer(state, {
      type: "list-start",
      serial: "device-a",
      requestId: 2,
    });
    state = deviceFileManagerReducer(state, {
      type: "list-error",
      serial: "device-a",
      requestId: 2,
      error: "permission denied",
    });

    expect(state.path).toBe(listing.path);
    expect(state.pathDraft).toBe(listing.path);
    expect(state.entries).toEqual(listing.entries);
  });

  it("ignores a preview response after another item is selected", () => {
    let state = createDeviceFileManagerState("device-a");
    state = deviceFileManagerReducer(state, { type: "select", path: imageEntry.path });
    state = deviceFileManagerReducer(state, {
      type: "preview-start",
      serial: "device-a",
      requestId: 1,
      path: imageEntry.path,
    });
    state = deviceFileManagerReducer(state, {
      type: "select",
      path: "/sdcard/Download/other.png",
    });
    const next = deviceFileManagerReducer(state, {
      type: "preview-success",
      serial: "device-a",
      requestId: 1,
      path: imageEntry.path,
      data: { data_url: "data:image/png;base64,AA==", mime_type: "image/png", size: 1 },
    });

    expect(next).toBe(state);
    expect(next.preview.data).toBeNull();
  });

  it("keeps success and failure results in one transfer batch", () => {
    let state = createDeviceFileManagerState("device-a");
    state = deviceFileManagerReducer(state, {
      type: "transfer-start",
      serial: "device-a",
      kind: "upload",
      items: [
        { sourcePath: "/tmp/a.txt", name: "a.txt" },
        { sourcePath: "/tmp/b.txt", name: "b.txt" },
      ],
    });
    state = deviceFileManagerReducer(state, {
      type: "transfer-item-success",
      serial: "device-a",
      index: 0,
      resultName: "a.txt",
      targetPath: "/sdcard/Download/a.txt",
    });
    state = deviceFileManagerReducer(state, {
      type: "transfer-item-error",
      serial: "device-a",
      index: 1,
      error: "permission denied",
    });
    state = deviceFileManagerReducer(state, {
      type: "transfer-finish",
      serial: "device-a",
    });

    expect(state.transfer?.status).toBe("finished");
    expect(state.transfer?.items.map((item) => item.status)).toEqual(["success", "error"]);
  });
});
