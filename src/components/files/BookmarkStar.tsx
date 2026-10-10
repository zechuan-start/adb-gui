import { useT } from "@/i18n";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Star } from "lucide-react";
import { BookmarkEditor } from "@/components/files/BookmarkEditor";
import {
  commandButtonClass,
  floatingSurfaceClass,
  iconButtonClass,
} from "@/components/files/buttonClasses";
import { useDismissableLayer } from "@/hooks/useDismissableLayer";
import { useDropdownPlacement } from "@/hooks/useDropdownPlacement";
import { BOOKMARK_COLOR_TEXT } from "@/lib/fileBookmarks";
import { cn } from "@/lib/utils";
import { useFileBookmarkStore } from "@/store/fileBookmarks";

interface BookmarkStarProps {
  // The directory this star bookmarks; `null` disables it.
  path: string | null;
  // `toolbar` is the icon button in the path bar; `details` is the labelled
  // command button in the details panel.
  variant: "toolbar" | "details";
}

/**
 * Bookmarks a directory in one click. Once bookmarked, the click opens the
 * editor instead of removing, so a stray click never loses the bookmark color.
 */
export function BookmarkStar({ path, variant }: BookmarkStarProps) {
  const t = useT();
  const bookmark = useFileBookmarkStore((state) =>
    path === null ? null : state.bookmarks.find((item) => item.path === path) ?? null,
  );
  const addBookmark = useFileBookmarkStore((state) => state.addBookmark);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const close = useCallback(() => setOpen(false), []);
  const bookmarked = bookmark !== null;
  const showPanel = open && bookmarked && path !== null;

  useDismissableLayer(showPanel, rootRef, triggerRef, close);
  const placement = useDropdownPlacement(showPanel, triggerRef, panelRef, 320, path ?? "");

  useEffect(() => {
    setOpen(false);
  }, [path]);

  const label = bookmarked ? t.files.bookmarks.editBookmark : t.files.bookmarks.bookmarkThisDirectory;
  const starClass = bookmark?.color
    ? BOOKMARK_COLOR_TEXT[bookmark.color]
    : bookmarked
      ? "text-ink"
      : undefined;

  function handleClick(): void {
    if (path === null) {
      return;
    }
    if (!bookmarked) {
      addBookmark(path);
      return;
    }
    setOpen((current) => !current);
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={handleClick}
        disabled={path === null}
        title={label}
        // The toolbar star is icon-only; the details button names itself.
        aria-label={variant === "toolbar" ? label : undefined}
        aria-haspopup={bookmarked ? "dialog" : undefined}
        aria-expanded={bookmarked ? showPanel : undefined}
        aria-controls={showPanel ? panelId : undefined}
        className={variant === "toolbar" ? iconButtonClass : commandButtonClass}
      >
        <Star
          className={cn("h-4 w-4", starClass)}
          fill={bookmarked ? "currentColor" : "none"}
        />
        {variant === "details" &&
          (bookmarked ? t.files.bookmarks.bookmarked : t.files.bookmarks.bookmark)}
      </button>
      {showPanel && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={t.files.bookmarks.editorLabel({ path })}
          style={{ maxHeight: placement.maxHeight }}
          className={cn(
            floatingSurfaceClass,
            "right-0 w-[232px] p-2.5",
            placement.side === "above" ? "bottom-full mb-2" : "top-full mt-2",
          )}
        >
          <BookmarkEditor
            path={path}
            onRemoved={() => {
              setOpen(false);
              triggerRef.current?.focus();
            }}
          />
        </div>
      )}
    </div>
  );
}
