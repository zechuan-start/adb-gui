import { createContext, useContext, useId, type ReactNode } from "react";
import { Switch } from "@/components/settings/controls/Switch";
import { findSettingsRow } from "@/lib/settingsSections";
import { cn } from "@/lib/utils";

interface SettingsViewValue {
  modified: (rowId: string) => boolean;
}

const SettingsViewContext = createContext<SettingsViewValue>({
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

export function SettingRowLabel({
  id,
  labelId,
  className,
}: {
  id: string;
  labelId?: string;
  className?: string;
}) {
  const row = findSettingsRow(id);
  const modified = useSettingsView().modified(id);
  return (
    <div
      id={labelId}
      className={cn("flex min-w-0 flex-col gap-0.5", className)}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
        <span>{row.label}</span>
        {modified && (
          <span
            title="当前值与默认不同"
            className="font-data text-[10px] text-note uppercase"
          >
            已修改
          </span>
        )}
      </div>
      {row.description && (
        <span className="text-[11px] leading-snug text-ink2">
          {row.description}
        </span>
      )}
    </div>
  );
}

export function SettingRow({
  id,
  layout = "inline",
  children,
}: {
  id: string;
  layout?: "inline" | "stacked";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "min-h-12 gap-6 border-b border-rule py-2.5 last:border-b-0",
        layout === "inline"
          ? "flex items-center justify-between"
          : "flex flex-col items-stretch gap-2",
      )}
    >
      <SettingRowLabel id={id} />
      <div className={cn(layout === "inline" ? "shrink-0" : "w-full")}>
        {children}
      </div>
    </div>
  );
}

export function SettingSwitchRow({
  id,
  checked,
  onChange,
  disabled = false,
}: {
  id: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const controlId = useId();
  const labelId = `${controlId}-label`;

  return (
    <div
      onClick={(event) => {
        if (disabled) return;
        if (
          event.target instanceof Element &&
          event.target.closest("button") !== null
        )
          return;
        onChange(!checked);
      }}
      className={cn(
        "flex min-h-12 items-center justify-between gap-6 border-b border-rule py-2.5 last:border-b-0",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
      )}
    >
      <SettingRowLabel id={id} labelId={labelId} />
      <Switch
        id={controlId}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        ariaLabelledBy={labelId}
      />
    </div>
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
