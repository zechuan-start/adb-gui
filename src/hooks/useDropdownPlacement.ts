import { useLayoutEffect, useState, type RefObject } from "react";
import { dropdownPlacement, type DropdownPlacement } from "@/lib/dropdownPlacement";

/**
 * Chooses above/below and a maximum height for an absolutely positioned
 * surface. Absolute surfaces are clipped by scroll containers, so the available
 * room is the intersection of the viewport and every clipping ancestor, the
 * same measurement `BlueprintSelect` makes. Re-measures on scroll and resize
 * while open, and when `contentKey` changes the surface's content.
 */
export function useDropdownPlacement(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  surfaceRef: RefObject<HTMLElement | null>,
  maxHeight: number,
  contentKey: string,
): DropdownPlacement {
  const [placement, setPlacement] = useState<DropdownPlacement>({
    side: "below",
    maxHeight,
  });

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    function updatePlacement(): void {
      const trigger = triggerRef.current;
      const surface = surfaceRef.current;
      if (!trigger || !surface) {
        return;
      }
      const bounds = { top: 0, bottom: window.innerHeight };
      for (let parent = trigger.parentElement; parent; parent = parent.parentElement) {
        if (!/(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflowY)) {
          continue;
        }
        const rect = parent.getBoundingClientRect();
        bounds.top = Math.max(bounds.top, rect.top + parent.clientTop);
        bounds.bottom = Math.min(bounds.bottom, rect.top + parent.clientTop + parent.clientHeight);
      }
      const next = dropdownPlacement(
        trigger.getBoundingClientRect(),
        bounds,
        Math.min(maxHeight, surface.scrollHeight + 2),
      );
      setPlacement((previous) =>
        previous.side === next.side && previous.maxHeight === next.maxHeight ? previous : next,
      );
    }

    updatePlacement();
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);
    return () => {
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
    };
  }, [contentKey, maxHeight, open, surfaceRef, triggerRef]);

  return placement;
}
