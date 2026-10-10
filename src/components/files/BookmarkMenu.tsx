import { useT } from "@/i18n";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { ArrowLeft, Bookmark, ChevronDown, Ellipsis, House } from "lucide-react";
import { BookmarkEditor } from "@/components/files/BookmarkEditor";
import { BookmarkFolderIcon } from "@/components/files/BookmarkFolderIcon";
import { floatingSurfaceClass, iconButtonClass } from "@/components/files/buttonClasses";
import { useDismissableLayer } from "@/hooks/useDismissableLayer";
import { useDropdownPlacement } from "@/hooks/useDropdownPlacement";
import { fileBookmarkName } from "@/lib/fileBookmarks";
import { cn } from "@/lib/utils";
import { useFileBookmarkStore } from "@/store/fileBookmarks";
import { useSettingsStore } from "@/store/settings";

// Header plus about ten two-line rows before the list scrolls.
const MENU_MAX_HEIGHT = 480;

type MenuView = { kind: "list" } | { kind: "edit"; path: string };

interface BookmarkMenuProps {
  // The directory on screen, highlighted in the list.
  currentPath: string | null;
  // Jumping needs an online, idle device; viewing and editing do not.
  navigationDisabled: boolean;
  onNavigate: (path: string) => void;
}

/**
 * The bookmark list behind the path bar's bookmark button. Editing swaps the
 * list for the shared editor inside the same surface rather than stacking a
 * second popover on top of it.
 */
export function BookmarkMenu({ currentPath, navigationDisabled, onNavigate }: BookmarkMenuProps) {
  const t = useT();
  const bookmarks = useFileBookmarkStore((state) => state.bookmarks);
  const startDirectory = useSettingsStore((state) => state.preferences.files.startDirectory);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<MenuView>({ kind: "list" });
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const backRef = useRef<HTMLButtonElement>(null);
  const pendingFocusRef = useRef<number | null>(null);
  const surfaceId = useId();
  const editing = view.kind === "edit" ? bookmarks.find((item) => item.path === view.path) : undefined;

  const close = useCallback(() => {
    setOpen(false);
    setView({ kind: "list" });
  }, []);

  useDismissableLayer(open, rootRef, triggerRef, close);
  const placement = useDropdownPlacement(
    open,
    triggerRef,
    surfaceRef,
    MENU_MAX_HEIGHT,
    `${view.kind}:${bookmarks.length}`,
  );

  // Move focus once the list has rendered: into it after a keyboard open,
  // or back to the edited row after leaving the editor.
  useEffect(() => {
    if (!open || view.kind !== "list" || pendingFocusRef.current === null) {
      return;
    }
    const index = Math.min(pendingFocusRef.current, bookmarks.length - 1);
    pendingFocusRef.current = null;
    const frame = window.requestAnimationFrame(() => {
      (index >= 0 ? itemRefs.current[index] : triggerRef.current)?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [bookmarks.length, open, view]);

  // The row's edit button unmounts with the list, so hand focus to the editor.
  useEffect(() => {
    if (view.kind === "edit") {
      backRef.current?.focus();
    }
  }, [view]);

  function openList(focusIndex: number | null): void {
    pendingFocusRef.current = focusIndex;
    setView({ kind: "list" });
    setOpen(true);
  }

  function focusItem(index: number): void {
    if (bookmarks.length === 0) {
      return;
    }
    itemRefs.current[(index + bookmarks.length) % bookmarks.length]?.focus();
  }

  function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>): void {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const index = event.key === "ArrowDown" ? 0 : bookmarks.length - 1;
      if (open && view.kind === "list") {
        focusItem(index);
      } else {
        openList(index);
      }
    }
  }

  function handleItemKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number): void {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusItem(index + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusItem(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusItem(0);
        break;
      case "End":
        event.preventDefault();
        focusItem(bookmarks.length - 1);
        break;
    }
  }

  function leaveEditor(path: string): void {
    pendingFocusRef.current = Math.max(0, bookmarks.findIndex((item) => item.path === path));
    setView({ kind: "list" });
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : openList(null))}
        onKeyDown={handleTriggerKeyDown}
        title={t.files.bookmarks.openBookmarks}
        aria-label={t.files.bookmarks.openBookmarks}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? surfaceId : undefined}
        className={cn(iconButtonClass, "w-11 gap-0.5")}
      >
        <Bookmark className="h-4 w-4" />
        <ChevronDown className="h-3 w-3" />
      </button>

      {open && (
        <div
          ref={surfaceRef}
          id={surfaceId}
          role="dialog"
          aria-label={t.files.bookmarks.openBookmarks}
          style={{ maxHeight: placement.maxHeight }}
          className={cn(
            floatingSurfaceClass,
            "left-0 w-[320px] max-w-[calc(100vw-32px)]",
            placement.side === "above" ? "bottom-full mb-2" : "top-full mt-2",
          )}
        >
          {editing ? (
            <>
              <button
                ref={backRef}
                type="button"
                onClick={() => leaveEditor(editing.path)}
                aria-label={t.files.bookmarks.backToList}
                title={t.files.bookmarks.backToList}
                className="sticky top-0 z-10 flex h-8 w-full min-w-0 items-center gap-2 border-b border-rule bg-paper px-2.5 text-left font-data text-[10.5px] font-medium text-ink2 hover:bg-hover hover:text-ink"
              >
                <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{fileBookmarkName(editing.path)}</span>
              </button>
              <div className="p-2.5">
                <BookmarkEditor path={editing.path} onRemoved={() => leaveEditor(editing.path)} />
              </div>
            </>
          ) : (
            <>
              <div className="sticky top-0 z-10 flex h-7 items-center border-b border-rule bg-paper px-2.5 font-data text-[10.5px] font-medium text-ink3">
                {t.files.bookmarks.heading({ count: bookmarks.length })}
              </div>
              {bookmarks.length === 0 ? (
                <p className="m-0 px-2.5 py-3 text-xs text-ink3">{t.files.bookmarks.empty}</p>
              ) : (
                <ul className="m-0 list-none p-0">
                  {bookmarks.map((bookmark, index) => {
                    const name = fileBookmarkName(bookmark.path);
                    const current = bookmark.path === currentPath;
                    return (
                      <li
                        key={bookmark.path}
                        className={cn(
                          "flex items-center border-b border-dashed border-rule2 last:border-b-0",
                          current && "bg-hover",
                        )}
                      >
                        <button
                          ref={(element) => {
                            itemRefs.current[index] = element;
                          }}
                          type="button"
                          // aria-disabled rather than disabled keeps rows
                          // focusable, so arrow keys still reach the edit
                          // buttons while no device is online.
                          aria-disabled={navigationDisabled || undefined}
                          aria-current={current ? "location" : undefined}
                          title={bookmark.path}
                          onClick={() => {
                            if (navigationDisabled) {
                              return;
                            }
                            onNavigate(bookmark.path);
                            close();
                            triggerRef.current?.focus();
                          }}
                          onKeyDown={(event) => handleItemKeyDown(event, index)}
                          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 py-1.5 pl-2.5 pr-1 text-left outline-none hover:bg-hover focus-visible:bg-hover aria-disabled:cursor-not-allowed aria-disabled:hover:bg-transparent"
                        >
                          <BookmarkFolderIcon color={bookmark.color} className="h-4 w-4 shrink-0" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[11.5px] font-medium text-ink">{name}</span>
                            <span className="block truncate font-data text-[10px] text-ink3">{bookmark.path}</span>
                          </span>
                          {bookmark.path === startDirectory && (
                            <House
                              className="h-4 w-4 shrink-0 text-ink3"
                              role="img"
                              aria-label={t.files.bookmarks.startDirectory}
                            >
                              <title>{t.files.bookmarks.startDirectory}</title>
                            </House>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setView({ kind: "edit", path: bookmark.path })}
                          aria-label={t.files.bookmarks.editItem({ name })}
                          title={t.files.bookmarks.editItem({ name })}
                          className="mr-1.5 inline-flex h-7 w-7 shrink-0 items-center justify-center text-ink3 hover:bg-hover hover:text-ink"
                        >
                          <Ellipsis className="h-4 w-4" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
