import { useMemo, useRef, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { DeviceSpecStrip } from "@/components/DeviceSpecStrip";
import { ToolModule } from "@/components/ToolModule";
import { useToolDrag } from "@/hooks/useToolDrag";
import { useT } from "@/i18n";
import {
  DEFAULT_TOOL_ORDER,
  sameToolOrder,
  toolPosition,
  type ToolModuleId,
} from "@/lib/toolLayout";
import { TOOL_MODULES } from "@/lib/toolModules";
import { useUiStore } from "@/store/ui";

interface ToolWorkbenchProps {
  active: boolean;
  activityRefreshing: boolean;
  onRefreshActivity: () => void;
}

export function ToolWorkbench({
  active,
  activityRefreshing,
  onRefreshActivity,
}: ToolWorkbenchProps) {
  const t = useT();
  const scrollRef = useRef<HTMLDivElement>(null);
  const storedOrder = useUiStore((state) => state.toolOrder);
  const resetToolOrder = useUiStore((state) => state.resetToolOrder);
  const drag = useToolDrag(scrollRef, active);

  // Built once per visibility change so a reorder moves each tool's existing
  // DOM subtree instead of remounting it, which would restart a recording timer
  // or a port-forward poll.
  const bodies = useMemo(
    () => new Map<ToolModuleId, ReactNode>(
      DEFAULT_TOOL_ORDER.map((id) => [id, TOOL_MODULES[id].render({ active })]),
    ),
    [active],
  );

  const total = drag.order.length;
  // Deliberately the committed order, not the live preview: this row is part of
  // the scroll flow, so letting it appear on the first preview swap would push
  // the whole grid down mid-gesture and move the drop targets under the pointer.
  const customized = !sameToolOrder(storedOrder, DEFAULT_TOOL_ORDER);
  const announcement = drag.announcedId
    ? t.shell.toolLayout.moved({
      title: TOOL_MODULES[drag.announcedId].title(t),
      position: toolPosition(drag.order, drag.announcedId),
      total,
    })
    : "";

  return (
    <div
      ref={scrollRef}
      className="h-full min-h-0 overflow-y-auto px-[18px] pb-6 pt-4"
    >
      <div className="space-y-4">
        <DeviceSpecStrip
          activityRefreshing={activityRefreshing}
          onRefreshActivity={onRefreshActivity}
        />
        {customized && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={resetToolOrder}
              className="flex items-center gap-1.5 border border-rule px-2 py-1 text-[11px] text-ink2 hover:border-ink3 hover:text-ink"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t.shell.toolLayout.reset}
            </button>
          </div>
        )}
        <div
          id="tool-grid"
          className="grid grid-cols-[repeat(auto-fill,minmax(min(240px,100%),1fr))] gap-3.5"
        >
          {drag.order.map((id, index) => {
            const definition = TOOL_MODULES[id];
            const title = definition.title(t);
            const dragging = drag.draggingId === id;
            return (
              <ToolModule
                key={id}
                icon={definition.icon()}
                title={title}
                reference={definition.reference}
                wide={definition.wide}
                drag={{
                  handleLabel: t.shell.toolLayout.dragHandle({
                    title,
                    position: index + 1,
                    total,
                  }),
                  dragging,
                  moduleRef: drag.moduleRef(id),
                  handleRef: drag.handleRef(id),
                  style: dragging
                    ? {
                      transform:
                        `translate(${drag.dragOffset.x}px, ${drag.dragOffset.y}px)`,
                    }
                    : undefined,
                  headerProps: {
                    onPointerDown: (event) => drag.onHeaderPointerDown(id, event),
                  },
                  onHandleKeyDown: (event) => drag.onHandleKeyDown(id, event),
                }}
              >
                {bodies.get(id)}
              </ToolModule>
            );
          })}
        </div>
      </div>
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
