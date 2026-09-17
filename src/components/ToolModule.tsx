import type {
  CSSProperties,
  HTMLAttributes,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
  Ref,
} from "react";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ToolModuleDragProps {
  /** Accessible name of the grip button, including the module's current position. */
  handleLabel: string;
  /** Following the pointer. */
  dragging: boolean;
  /** Painted above the other modules: while dragged and while landing after a drop. */
  lifted: boolean;
  moduleRef: Ref<HTMLElement>;
  handleRef: Ref<HTMLButtonElement>;
  style?: CSSProperties;
  /** Pointer handlers for the header, which is the drag surface in full. */
  headerProps: HTMLAttributes<HTMLElement>;
  onHandleKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
}

export interface ToolModuleProps {
  icon: ReactNode;
  title: string;
  reference: string;
  children: ReactNode;
  wide?: boolean;
  /** Omitted where a module is rendered outside the reorderable grid. */
  drag?: ToolModuleDragProps;
}

export function ToolModule({
  icon,
  title,
  reference,
  children,
  wide = false,
  drag,
}: ToolModuleProps) {
  return (
    <section
      ref={drag?.moduleRef}
      style={drag?.style}
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-[2px] border border-rule bg-surface2",
        wide && "min-[1180px]:col-span-2",
        // Opaque while lifted: the module floats over other cards and the
        // blueprint grid, which stay readable through the translucent surface.
        drag?.lifted
          && "relative z-10 border-ink3 bg-paper shadow-[3px_3px_0_var(--color-hard-shadow)]",
      )}
    >
      <header
        {...(drag?.headerProps ?? {})}
        className={cn(
          "flex min-w-0 items-center gap-2 border-b border-rule px-3 py-[7px]",
          drag && "touch-none cursor-grab select-none",
          drag?.dragging && "cursor-grabbing",
        )}
      >
        {drag && (
          <button
            type="button"
            ref={drag.handleRef}
            aria-label={drag.handleLabel}
            onKeyDown={drag.onHandleKeyDown}
            className="flex h-4 w-4 shrink-0 items-center justify-center text-ink3 hover:text-ink focus-visible:outline focus-visible:outline-1 focus-visible:outline-ink2"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        <span
          aria-hidden="true"
          className="flex h-4 w-4 shrink-0 items-center justify-center text-ink2 [&>svg]:h-4 [&>svg]:w-4"
        >
          {icon}
        </span>
        <h3 className="min-w-0 truncate text-[13px] font-semibold text-ink">
          {title}
        </h3>
        <span className="ml-auto shrink-0 font-data text-[10.5px] text-ink3">
          {reference}
        </span>
      </header>
      <div className="flex min-w-0 flex-1 flex-col p-3 [&_button:not(:disabled):active]:scale-[0.98]">
        {children}
      </div>
    </section>
  );
}
