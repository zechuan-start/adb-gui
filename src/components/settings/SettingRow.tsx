import { createContext, useContext, type ReactNode } from "react";
import { findSettingsRow } from "@/lib/settingsSections";
import { cn } from "@/lib/utils";

interface SettingsViewValue {
  visible: (rowId: string) => boolean;
  modified: (rowId: string) => boolean;
}

const SettingsViewContext = createContext<SettingsViewValue>({
  visible: () => true,
  modified: () => false,
});

export function SettingsView({
  value,
  children,
}: {
  value: SettingsViewValue;
  children: ReactNode;
}) {
  return (
    <SettingsViewContext.Provider value={value}>
      {children}
    </SettingsViewContext.Provider>
  );
}

export function useSettingsView(): SettingsViewValue {
  return useContext(SettingsViewContext);
}

// Search filters rows in place, so every row-shaped block passes through a gate
// instead of each section re-implementing the query.
export function SettingsRowGate({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  return useSettingsView().visible(id) ? <>{children}</> : null;
}

export function SettingsGroup({
  title,
  rowIds,
  children,
}: {
  title?: string;
  rowIds: readonly string[];
  children: ReactNode;
}) {
  const { visible } = useSettingsView();
  if (!rowIds.some((id) => visible(id))) return null;
  return (
    <>
      {title && (
        <div className="mt-4 pb-1 text-[11px] font-semibold text-ink2 first:mt-0">
          {title}
        </div>
      )}
      {children}
    </>
  );
}

// Exported for rows that need their own layout: the label and description still
// come from the registry, so search and the panel can never disagree.
export function SettingRowLabel({
  id,
  className,
}: {
  id: string;
  className?: string;
}) {
  const row = findSettingsRow(id);
  const modified = useSettingsView().modified(id);
  return (
    <span className={cn("flex min-w-0 flex-col gap-0.5", className)}>
      <span className="flex items-center gap-1.5 text-xs">
        {row.label}
        {modified && (
          <span
            aria-hidden="true"
            title="已改动"
            className="h-1.5 w-1.5 shrink-0 bg-note"
          />
        )}
      </span>
      {row.description && (
        <span className="text-[11px] leading-snug text-ink3">
          {row.description}
        </span>
      )}
    </span>
  );
}

export function SettingRow({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  return (
    <SettingsRowGate id={id}>
      <div className="flex min-h-12 items-center justify-between gap-4 border-b border-rule py-2.5 last:border-b-0">
        <SettingRowLabel id={id} />
        <span className="shrink-0">{children}</span>
      </div>
    </SettingsRowGate>
  );
}

export function SettingToggle({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <SettingsRowGate id={id}>
      <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 border-b border-rule py-2.5 last:border-b-0">
        <SettingRowLabel id={id} />
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(event) => onChange(event.currentTarget.checked)}
          className="h-4 w-4 shrink-0 accent-ink"
        />
      </label>
    </SettingsRowGate>
  );
}

// Only the settings file can become unreadable, so a section wraps the controls
// it owns and leaves theme or window preferences outside the fieldset.
export function SettingsFieldset({
  available,
  children,
}: {
  available: boolean;
  children: ReactNode;
}) {
  return (
    <fieldset disabled={!available} className="min-w-0 disabled:opacity-50">
      {children}
    </fieldset>
  );
}
