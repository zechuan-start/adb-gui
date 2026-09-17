import { useMemo, useRef, type ReactNode } from "react";
import { DeviceSpecStrip } from "@/components/DeviceSpecStrip";
import { ToolModule } from "@/components/ToolModule";
import { useToolDrag } from "@/hooks/useToolDrag";
import { useT } from "@/i18n";
import {
  DEFAULT_TOOL_ORDER,
  toolPosition,
  type ToolModuleId,
} from "@/lib/toolLayout";
import { TOOL_MODULES } from "@/lib/toolModules";

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
        {/* Positioned so it is the offset parent the drag and FLIP layers measure against. */}
        <div
          ref={drag.gridRef}
          id="tool-grid"
          className="relative grid grid-cols-[repeat(auto-fill,minmax(min(240px,100%),1fr))] gap-3.5"
        >
          {drag.order.map((id, index) => {
            const definition = TOOL_MODULES[id];
            const title = definition.title(t);
            const dragging = drag.draggingId === id;
            const lifted = drag.liftedId === id;
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
                  lifted,
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
