import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  addFileBookmark,
  reconcileFileBookmarks,
  removeFileBookmark,
  setFileBookmarkColor,
  type BookmarkColor,
  type FileBookmark,
} from "@/lib/fileBookmarks";

// Kept apart from `adb-gui-settings` so restoring default settings never
// deletes bookmarks, and from `adb-gui-ui`, which only holds layout state.
const FILE_BOOKMARKS_STORAGE_KEY = "adb-gui-file-bookmarks";

interface PersistedFileBookmarks {
  bookmarks: readonly FileBookmark[];
}

export interface FileBookmarkState extends PersistedFileBookmarks {
  addBookmark: (path: string) => void;
  removeBookmark: (path: string) => void;
  setBookmarkColor: (path: string, color: BookmarkColor | null) => void;
}

export const useFileBookmarkStore = create<FileBookmarkState>()(
  persist(
    (set) => {
      // Returning the current state for an unchanged list makes zustand skip
      // the update, so subscribers are not notified for a no-op.
      function apply(
        update: (bookmarks: readonly FileBookmark[]) => readonly FileBookmark[],
      ): void {
        set((state) => {
          const bookmarks = update(state.bookmarks);
          return bookmarks === state.bookmarks ? state : { bookmarks };
        });
      }

      return {
        bookmarks: [],
        addBookmark: (path) => apply((bookmarks) => addFileBookmark(bookmarks, path)),
        removeBookmark: (path) => apply((bookmarks) => removeFileBookmark(bookmarks, path)),
        setBookmarkColor: (path, color) =>
          apply((bookmarks) => setFileBookmarkColor(bookmarks, path, color)),
      };
    },
    {
      name: FILE_BOOKMARKS_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state): PersistedFileBookmarks => ({ bookmarks: state.bookmarks }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        bookmarks: reconcileFileBookmarks(
          isRecord(persistedState) ? persistedState.bookmarks : undefined,
        ),
      }),
    },
  ),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
