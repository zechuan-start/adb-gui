import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface ToolModuleProps {
  icon: ReactNode;
  title: string;
  reference: string;
  children: ReactNode;
  wide?: boolean;
}

export function ToolModule({
  icon,
  title,
  reference,
  children,
  wide = false,
}: ToolModuleProps) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-[2px] border border-rule bg-surface2",
        wide && "min-[1180px]:col-span-2",
      )}
    >
      <header className="flex min-w-0 items-center gap-2 border-b border-rule px-3 py-[7px]">
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
