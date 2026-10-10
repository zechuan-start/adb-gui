import { Folder } from "lucide-react";
import { BOOKMARK_COLOR_TEXT, type BookmarkColor } from "@/lib/fileBookmarks";
import { cn } from "@/lib/utils";

/**
 * A colored bookmark is a filled folder, so it differs from a plain folder in
 * shape as well as hue. Colorless bookmarks keep the plain outline.
 */
export function BookmarkFolderIcon({
  color,
  className,
}: {
  color: BookmarkColor | null;
  className: string;
}) {
  return color ? (
    <Folder
      className={cn(className, BOOKMARK_COLOR_TEXT[color])}
      fill="currentColor"
      fillOpacity={0.85}
    />
  ) : (
    <Folder className={cn(className, "text-note")} />
  );
}
