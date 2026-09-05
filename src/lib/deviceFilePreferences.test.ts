import { describe, expect, it } from "vitest";
import {
  createDeviceFileManagerState,
  deviceFileManagerReducer,
  projectDeviceFiles,
} from "@/lib/deviceFiles";
import { defaultSettings } from "@/lib/settings";
import type { DeviceFileEntry } from "@/lib/tauri";

const rows: DeviceFileEntry[] = [
  {
    name: "z",
    path: "/z",
    kind: "directory",
    size: 4096,
    modified_at: 1,
    previewable: false,
  },
  {
    name: "a",
    path: "/a",
    kind: "file",
    size: 0,
    modified_at: 3,
    previewable: false,
  },
  {
    name: "B",
    path: "/B",
    kind: "symlink",
    size: 10,
    modified_at: 2,
    previewable: false,
  },
  {
    name: ".图片",
    path: "/.图片",
    kind: "file",
    size: 20,
    modified_at: 4,
    previewable: true,
  },
];
const names = (entries: DeviceFileEntry[]) =>
  entries.map((entry) => entry.name);

describe("file preferences projection", () => {
  it("keeps default case-insensitive directory-first order and immutable entries", () => {
    const view = projectDeviceFiles(rows, defaultSettings().files);
    expect(names(view)).toEqual(["z", ".图片", "a", "B"]);
    expect(names(rows)).toEqual(["z", "a", "B", ".图片"]);
    expect(view[2]).toBe(rows[1]);
  });

  it("filters dot names and reverses names without reversing directory priority", () => {
    expect(
      names(
        projectDeviceFiles(rows, {
          ...defaultSettings().files,
          showHidden: false,
          sortDirection: "desc",
        }),
      ),
    ).toEqual(["z", "B", "a"]);
    expect(
      names(
        projectDeviceFiles(rows, {
          ...defaultSettings().files,
          directoriesFirst: false,
        }),
      ),
    ).toEqual([".图片", "a", "B", "z"]);
  });

  it("sorts timestamps and sizes, preserving zero-byte files and placing directory sizes last", () => {
    const base = { ...defaultSettings().files, directoriesFirst: false };
    expect(
      names(projectDeviceFiles(rows, { ...base, sortBy: "modifiedAt" })),
    ).toEqual(["z", "B", "a", ".图片"]);
    expect(
      names(
        projectDeviceFiles(rows, {
          ...base,
          sortBy: "modifiedAt",
          sortDirection: "desc",
        }),
      ),
    ).toEqual([".图片", "a", "B", "z"]);
    expect(
      names(projectDeviceFiles(rows, { ...base, sortBy: "size" })),
    ).toEqual(["a", "B", ".图片", "z"]);
    expect(
      names(
        projectDeviceFiles(rows, {
          ...base,
          sortBy: "size",
          sortDirection: "desc",
        }),
      ),
    ).toEqual([".图片", "B", "a", "z"]);
  });

  it("uses deterministic names for equal values and never treats a symlink as a directory", () => {
    const entries = rows.map((entry) => ({
      ...entry,
      size: 0,
      modified_at: 0,
    }));
    const prefs = {
      ...defaultSettings().files,
      sortBy: "size" as const,
      sortDirection: "desc" as const,
    };
    expect(names(projectDeviceFiles(entries, prefs))).toEqual([
      "z",
      ".图片",
      "a",
      "B",
    ]);
  });

  it("rejects late preview after a filtered selection is cleared while preserving transfer data", () => {
    let state = createDeviceFileManagerState("a");
    state = deviceFileManagerReducer(state, { type: "select", path: "/.图片" });
    state = deviceFileManagerReducer(state, {
      type: "preview-start",
      serial: "a",
      path: "/.图片",
      requestId: 9,
    });
    state = deviceFileManagerReducer(state, {
      type: "transfer-start",
      serial: "a",
      kind: "download",
      items: [{ sourcePath: "/.图片", name: ".图片" }],
    });
    const transfer = state.transfer;
    state = deviceFileManagerReducer(state, { type: "select", path: null });
    const cleared = state;
    state = deviceFileManagerReducer(state, {
      type: "preview-success",
      serial: "a",
      path: "/.图片",
      requestId: 9,
      data: {
        data_url: "data:image/png;base64,a",
        mime_type: "image/png",
        size: 1,
      },
    });
    expect(state).toBe(cleared);
    expect(state.preview.data).toBeNull();
    expect(state.transfer).toBe(transfer);
  });

  it("preserves an initial failed target for correction without claiming a loaded directory", () => {
    let state = createDeviceFileManagerState("a");
    state = deviceFileManagerReducer(state, {
      type: "set-path-draft",
      value: "/missing 中文",
    });
    state = deviceFileManagerReducer(state, {
      type: "list-start",
      serial: "a",
      requestId: 1,
    });
    state = deviceFileManagerReducer(state, {
      type: "list-error",
      serial: "a",
      requestId: 1,
      error: "not found",
    });
    expect(state.pathDraft).toBe("/missing 中文");
    expect(state.path).toBe("");
    expect(state.listLoading).toBe(false);
  });
});
