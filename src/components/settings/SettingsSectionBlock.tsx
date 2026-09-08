import { useT } from "@/i18n";
import type { ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import type { SettingsSectionMeta } from "@/lib/settingsSections";

interface SettingsSectionBlockProps {
  meta: SettingsSectionMeta;
  index: number;
  dirty: boolean;
  onReset: () => void;
  sectionRef: (element: HTMLElement | null) => void;
  children: ReactNode;
}

export function SettingsSectionBlock({
  meta,
  index,
  dirty,
  onReset,
  sectionRef,
  children,
}: SettingsSectionBlockProps) {
  const t = useT();
  const headingId = `settings-heading-${meta.id}`;
  return (
    <section
      ref={sectionRef}
      id={`settings-section-${meta.id}`}
      aria-labelledby={headingId}
      tabIndex={-1}
      className="scroll-mt-3 pb-7 last:pb-0"
    >
      <div className="flex min-h-8 items-center gap-3 border-b border-ink">
        <h3
          id={headingId}
          className="font-data text-[10px] tracking-[0.12em] text-ink2 uppercase"
        >
          {String(index + 1).padStart(2, "0")} {meta.label(t)}
        </h3>
        {dirty && (
          <button
            type="button"
            onClick={onReset}
            className="ml-auto inline-flex h-7 items-center gap-1.5 px-1.5 text-[11px] text-ink2 hover:bg-hover hover:text-ink"
          >
            <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
            {t.settings.dialog.reset}</button>
        )}
      </div>
      {children}
    </section>
  );
}
