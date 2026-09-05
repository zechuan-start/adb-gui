import type { ReactNode } from "react";

export function SettingRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 border-b border-rule py-2.5 text-xs last:border-b-0">
      <span>{label}</span>
      {children}
    </div>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4 border-b border-rule py-2.5 text-xs last:border-b-0">
      <span>{label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="h-4 w-4 shrink-0 accent-ink"
      />
    </label>
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
