import { useT } from "@/i18n";
import { useId, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Check, House, X } from "lucide-react";
import { commandButtonClass } from "@/components/files/buttonClasses";
import {
  BOOKMARK_COLORS,
  BOOKMARK_COLOR_BG,
  type BookmarkColor,
} from "@/lib/fileBookmarks";
import { cn } from "@/lib/utils";
import { useFileBookmarkStore } from "@/store/fileBookmarks";
import { useSettingsStore } from "@/store/settings";

const SWATCHES: readonly (BookmarkColor | null)[] = [null, ...BOOKMARK_COLORS];

interface BookmarkEditorProps {
  path: string;
  // Called after the bookmark is removed, so the owner can close or step back.
  onRemoved: () => void;
}

/**
 * Color, start directory and removal for one bookmark. Shared by the star
 * popover and the bookmark menu's edit view, so both stay identical.
 */
export function BookmarkEditor({ path, onRemoved }: BookmarkEditorProps) {
  const t = useT();
  const labelId = useId();
  const color = useFileBookmarkStore(
    (state) => state.bookmarks.find((bookmark) => bookmark.path === path)?.color ?? null,
  );
  const setBookmarkColor = useFileBookmarkStore((state) => state.setBookmarkColor);
  const removeBookmark = useFileBookmarkStore((state) => state.removeBookmark);
  const settingsAvailable = useSettingsStore((state) => state.available);
  const isStartDirectory = useSettingsStore(
    (state) => state.preferences.files.startDirectory === path,
  );
  const swatchRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = SWATCHES.indexOf(color);

  function chooseAt(index: number): void {
    const nextIndex = (index + SWATCHES.length) % SWATCHES.length;
    setBookmarkColor(path, SWATCHES[nextIndex]);
    swatchRefs.current[nextIndex]?.focus();
  }

  function handleSwatchKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number): void {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      chooseAt(index + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      chooseAt(index - 1);
    }
  }

  function setAsStartDirectory(): void {
    // Same write path as the settings row, so the settings panel shows it.
    const store = useSettingsStore.getState();
    store.update("files", { ...store.preferences.files, startDirectory: path });
  }

  return (
    <div className="flex flex-col gap-2">
      <span id={labelId} className="font-data text-[10px] text-ink3">
        {t.files.bookmarks.color}
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className="flex flex-wrap gap-1.5">
        {SWATCHES.map((swatch, index) => {
          const selected = index === selectedIndex;
          const label = swatch ? t.files.bookmarks.colors[swatch] : t.files.bookmarks.noColor;
          return (
            <button
              ref={(element) => {
                swatchRefs.current[index] = element;
              }}
              key={swatch ?? "none"}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={label}
              title={label}
              tabIndex={selected ? 0 : -1}
              onClick={() => setBookmarkColor(path, swatch)}
              onKeyDown={(event) => handleSwatchKeyDown(event, index)}
              className={cn(
                "flex h-[22px] w-[22px] items-center justify-center border border-rule outline-none hover:border-ink3 focus-visible:border-note",
                selected && "border-2 border-ink",
              )}
            >
              {swatch ? (
                <span className={cn("block h-3 w-3", BOOKMARK_COLOR_BG[swatch])} />
              ) : (
                <span className="block h-3 w-3 border border-ink3 bg-[linear-gradient(135deg,transparent_44%,var(--color-ink3)_44%,var(--color-ink3)_56%,transparent_56%)]" />
              )}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={setAsStartDirectory}
        disabled={!settingsAvailable || isStartDirectory}
        title={settingsAvailable ? undefined : t.files.bookmarks.startDirectoryUnavailable}
        className={cn(commandButtonClass, "mt-1 h-8 justify-start")}
      >
        {isStartDirectory ? <Check className="h-4 w-4" /> : <House className="h-4 w-4" />}
        {isStartDirectory ? t.files.bookmarks.isStartDirectory : t.files.bookmarks.setAsStartDirectory}
      </button>
      <button
        type="button"
        onClick={() => {
          removeBookmark(path);
          onRemoved();
        }}
        className={cn(commandButtonClass, "h-8 justify-start text-err")}
      >
        <X className="h-4 w-4" />
        {t.files.bookmarks.removeBookmark}
      </button>
    </div>
  );
}
