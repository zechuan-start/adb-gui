import { describe, expect, it } from "vitest";
import {
  BOOKMARK_COLORS,
  BOOKMARK_COLOR_BG,
  BOOKMARK_COLOR_TEXT,
  addFileBookmark,
  fileBookmarkMap,
  fileBookmarkName,
  isBookmarkColor,
  normalizeBookmarkPath,
  reconcileFileBookmarks,
  removeFileBookmark,
  setFileBookmarkColor,
  type FileBookmark,
} from "@/lib/fileBookmarks";

describe("normalizeBookmarkPath", () => {
  it("matches the backend normalize_device_path cases", () => {
    expect(normalizeBookmarkPath("/sdcard//Download/./images")).toBe("/sdcard/Download/images");
    expect(normalizeBookmarkPath("/sdcard/Download/../Pictures")).toBe("/sdcard/Pictures");
    expect(normalizeBookmarkPath("/")).toBe("/");
    expect(normalizeBookmarkPath("relative/path")).toBeNull();
    expect(normalizeBookmarkPath("/../data")).toBeNull();
  });

  it("drops trailing slashes and collapses the root", () => {
    expect(normalizeBookmarkPath("/sdcard/DCIM/")).toBe("/sdcard/DCIM");
    expect(normalizeBookmarkPath("//")).toBe("/");
    expect(normalizeBookmarkPath("/sdcard/..")).toBe("/");
  });

  it("rejects empty and NUL-bearing paths", () => {
    expect(normalizeBookmarkPath("")).toBeNull();
    expect(normalizeBookmarkPath("/sdcard/a\0b")).toBeNull();
  });
});

describe("reconcileFileBookmarks", () => {
  it("returns an empty list for non-array input", () => {
    expect(reconcileFileBookmarks(undefined)).toEqual([]);
    expect(reconcileFileBookmarks(null)).toEqual([]);
    expect(reconcileFileBookmarks("/sdcard")).toEqual([]);
    expect(reconcileFileBookmarks({ path: "/sdcard" })).toEqual([]);
  });

  it("keeps a valid list unchanged", () => {
    const valid: FileBookmark[] = [
      { path: "/sdcard/DCIM", color: "orange" },
      { path: "/sdcard/Download", color: null },
    ];
    expect(reconcileFileBookmarks(valid)).toEqual(valid);
  });

  it("drops malformed entries and keeps the rest in order", () => {
    expect(
      reconcileFileBookmarks([
        "/sdcard/DCIM",
        null,
        [],
        { color: "blue" },
        { path: 42, color: "blue" },
        { path: "relative", color: "blue" },
        { path: "/../escape", color: "blue" },
        { path: "/sdcard/Music", color: "cyan" },
      ]),
    ).toEqual([{ path: "/sdcard/Music", color: "cyan" }]);
  });

  it("clears unknown colors instead of dropping the bookmark", () => {
    expect(
      reconcileFileBookmarks([
        { path: "/sdcard/A", color: "red" },
        { path: "/sdcard/B", color: 3 },
        { path: "/sdcard/C" },
      ]),
    ).toEqual([
      { path: "/sdcard/A", color: null },
      { path: "/sdcard/B", color: null },
      { path: "/sdcard/C", color: null },
    ]);
  });

  it("normalizes paths and keeps the first of each duplicate", () => {
    expect(
      reconcileFileBookmarks([
        { path: "/sdcard//DCIM/", color: "pink" },
        { path: "/sdcard/DCIM", color: "lime" },
        { path: "/sdcard/./Music", color: null },
      ]),
    ).toEqual([
      { path: "/sdcard/DCIM", color: "pink" },
      { path: "/sdcard/Music", color: null },
    ]);
  });
});

describe("bookmark list operations", () => {
  const list: readonly FileBookmark[] = [
    { path: "/sdcard/DCIM", color: "orange" },
    { path: "/sdcard/Download", color: null },
  ];

  it("appends a new bookmark without a color", () => {
    expect(addFileBookmark(list, "/sdcard/Music")).toEqual([
      ...list,
      { path: "/sdcard/Music", color: null },
    ]);
  });

  it("returns the same list when adding an existing path", () => {
    expect(addFileBookmark(list, "/sdcard/DCIM")).toBe(list);
  });

  it("removes a bookmark and returns the same list for an unknown path", () => {
    expect(removeFileBookmark(list, "/sdcard/DCIM")).toEqual([
      { path: "/sdcard/Download", color: null },
    ]);
    expect(removeFileBookmark(list, "/sdcard/Music")).toBe(list);
  });

  it("sets and clears a color without touching other bookmarks", () => {
    const colored = setFileBookmarkColor(list, "/sdcard/Download", "blue");
    expect(colored).toEqual([
      { path: "/sdcard/DCIM", color: "orange" },
      { path: "/sdcard/Download", color: "blue" },
    ]);
    expect(colored[0]).toBe(list[0]);
    expect(setFileBookmarkColor(colored, "/sdcard/DCIM", null)[0]).toEqual({
      path: "/sdcard/DCIM",
      color: null,
    });
  });

  it("returns the same list when the color is unchanged or the path is unknown", () => {
    expect(setFileBookmarkColor(list, "/sdcard/DCIM", "orange")).toBe(list);
    expect(setFileBookmarkColor(list, "/sdcard/Music", "blue")).toBe(list);
  });

  it("indexes bookmarks by path", () => {
    const map = fileBookmarkMap(list);
    expect(map.get("/sdcard/DCIM")).toBe(list[0]);
    expect(map.has("/sdcard/Music")).toBe(false);
  });
});

describe("bookmark presentation", () => {
  it("names a bookmark after its last segment", () => {
    expect(fileBookmarkName("/sdcard/DCIM/Camera")).toBe("Camera");
    expect(fileBookmarkName("/sdcard")).toBe("sdcard");
    expect(fileBookmarkName("/")).toBe("/");
  });

  it("maps every palette color to static tag utilities", () => {
    for (const color of BOOKMARK_COLORS) {
      expect(isBookmarkColor(color)).toBe(true);
      expect(BOOKMARK_COLOR_TEXT[color]).toBe(`text-tag-${color}`);
      expect(BOOKMARK_COLOR_BG[color]).toBe(`bg-tag-${color}`);
    }
    expect(isBookmarkColor("red")).toBe(false);
    expect(isBookmarkColor(null)).toBe(false);
  });
});
