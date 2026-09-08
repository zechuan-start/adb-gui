interface VerticalBounds {
  top: number;
  bottom: number;
}

export interface DropdownPlacement {
  side: "above" | "below";
  maxHeight: number;
}

export function dropdownPlacement(
  trigger: VerticalBounds,
  bounds: VerticalBounds,
  menuHeight: number,
): DropdownPlacement {
  const gap = 8;
  const below = Math.max(0, bounds.bottom - trigger.bottom - gap);
  const above = Math.max(0, trigger.top - bounds.top - gap);
  const side = below < menuHeight && above > below ? "above" : "below";
  return { side, maxHeight: Math.min(menuHeight, side === "above" ? above : below) };
}
