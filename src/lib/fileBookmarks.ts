// File pane bookmarks: palette identity and list algebra.
//
// Bookmarks are user data shared by every device, so they live in their own
// store instead of `lib/settings.ts`, whose sections are reset by "restore
// defaults". Paths are compared as the lexically normalized strings the backend
// returns; symlinks are not resolved, so `/sdcard/Download` and
// `/storage/emulated/0/Download` are two bookmarks.

export const BOOKMARK_COLORS = ["orange", "lime", "cyan", "blue", "pink"] as const;
export type BookmarkColor = (typeof BOOKMARK_COLORS)[number];

export interface FileBookmark {
  path: string;
  color: BookmarkColor | null;
}

// Spelled out in full so Tailwind can find every `tag-*` utility in the source.
export const BOOKMARK_COLOR_TEXT: Record<BookmarkColor, string> = {
  orange: "text-tag-orange",
  lime: "text-tag-lime",
  cyan: "text-tag-cyan",
  blue: "text-tag-blue",
  pink: "text-tag-pink",
};

export const BOOKMARK_COLOR_BG: Record<BookmarkColor, string> = {
  orange: "bg-tag-orange",
  lime: "bg-tag-lime",
  cyan: "bg-tag-cyan",
  blue: "bg-tag-blue",
  pink: "bg-tag-pink",
};

const BOOKMARK_COLOR_SET: ReadonlySet<string> = new Set<string>(BOOKMARK_COLORS);

export function isBookmarkColor(value: unknown): value is BookmarkColor {
  return typeof value === "string" && BOOKMARK_COLOR_SET.has(value);
}

/**
 * Applies the backend's `normalize_device_path` rules: absolute only, no NUL,
 * empty and `.` segments dropped, `..` pops a segment and may not climb above
 * the root. Returns `null` where the backend would reject the path.
 */
export function normalizeBookmarkPath(path: string): string | null {
  if (!path.startsWith("/") || path.includes("\0")) {
    return null;
  }

  const segments: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      if (segments.pop() === undefined) {
        return null;
      }
      continue;
    }
    segments.push(segment);
  }

  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

/**
 * Turns an arbitrary persisted value into a valid, duplicate-free list.
 *
 * Invalid entries are dropped one by one rather than discarding the whole list,
 * so a single bad record cannot cost the user every other bookmark. Never throws.
 */
export function reconcileFileBookmarks(persisted: unknown): FileBookmark[] {
  if (!Array.isArray(persisted)) {
    return [];
  }

  const seen = new Set<string>();
  const reconciled: FileBookmark[] = [];
  for (const entry of persisted) {
    if (!isRecord(entry) || typeof entry.path !== "string") {
      continue;
    }
    const path = normalizeBookmarkPath(entry.path);
    if (path === null || seen.has(path)) {
      continue;
    }
    seen.add(path);
    reconciled.push({ path, color: isBookmarkColor(entry.color) ? entry.color : null });
  }
  return reconciled;
}

// The list operations return the input array when nothing changes, so a store
// can skip the update and selectors keep their previous reference.

export function addFileBookmark(
  bookmarks: readonly FileBookmark[],
  path: string,
): readonly FileBookmark[] {
  if (bookmarks.some((bookmark) => bookmark.path === path)) {
    return bookmarks;
  }
  return [...bookmarks, { path, color: null }];
}

export function removeFileBookmark(
  bookmarks: readonly FileBookmark[],
  path: string,
): readonly FileBookmark[] {
  return bookmarks.some((bookmark) => bookmark.path === path)
    ? bookmarks.filter((bookmark) => bookmark.path !== path)
    : bookmarks;
}

export function setFileBookmarkColor(
  bookmarks: readonly FileBookmark[],
  path: string,
  color: BookmarkColor | null,
): readonly FileBookmark[] {
  const index = bookmarks.findIndex((bookmark) => bookmark.path === path);
  if (index === -1 || bookmarks[index].color === color) {
    return bookmarks;
  }
  return bookmarks.map((bookmark, current) => (current === index ? { ...bookmark, color } : bookmark));
}

/** The last path segment, or `/` for the root. */
export function fileBookmarkName(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return name || "/";
}

export function fileBookmarkMap(
  bookmarks: readonly FileBookmark[],
): ReadonlyMap<string, FileBookmark> {
  return new Map(bookmarks.map((bookmark) => [bookmark.path, bookmark]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
