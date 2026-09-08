import { type AppErrorPayload } from "@/i18n/errors";
import { useT, errorText } from "@/i18n";
import { useEffect, useState } from "react";
import { BlueprintSelect } from "@/components/BlueprintSelect";
import { SettingRow } from "@/components/settings/SettingRow";
import { deviceStartDirectoryError } from "@/lib/settings";
import { useSettingsStore } from "@/store/settings";



export function StartDirectoryPreference() {
  const t = useT();
const PRESETS = [
  { value: "download", label: t.settings.startDirectory.download, path: null },
  { value: "storage", label: t.settings.startDirectory.storage, path: "/sdcard" },
  { value: "camera", label: t.settings.startDirectory.camera, path: "/sdcard/DCIM/Camera" },
] as const;
const OPTIONS = [...PRESETS, { value: "custom", label: t.settings.startDirectory.custom }];
  const path = useSettingsStore(
    (state) => state.preferences.files.startDirectory,
  );
  const initialMode =
    PRESETS.find((option) => option.path === path)?.value ?? "custom";
  const [mode, setMode] = useState<string>(initialMode);
  const [draft, setDraft] = useState(path ?? "");
  const [error, setError] = useState<AppErrorPayload | null>(null);

  useEffect(() => {
    setMode(initialMode);
    setDraft(path ?? "");
    setError(null);
  }, [initialMode, path]);

  function save(next: string | null): boolean {
    const store = useSettingsStore.getState();
    store.update("files", { ...store.preferences.files, startDirectory: next });
    return !useSettingsStore.getState().error;
  }

  function commit() {
    const invalid = deviceStartDirectoryError(draft);
    setError(invalid);
    if (!invalid) save(draft);
  }

  return (
    <SettingRow id="startDirectory" layout="stacked">
      <div className="text-xs">
        <BlueprintSelect
          value={mode}
          options={OPTIONS}
          ariaLabel={t.settings.rows.startDirectory.label}
          containerClassName="w-44 shrink-0"
          onValueChange={(value) => {
            if (value === "custom") {
              setMode(value);
              setError(null);
              return;
            }
            const preset = PRESETS.find((option) => option.value === value);
            if (preset && save(preset.path)) {
              setMode(value);
              setError(null);
            }
          }}
        />
        {mode === "custom" && (
          <div className="mt-2">
            <input
              value={draft}
              aria-label={t.settings.startDirectory.label}
              aria-invalid={Boolean(error)}
              spellCheck={false}
              onChange={(event) => {
                setDraft(event.target.value);
                setError(null);
              }}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commit();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  setDraft(path ?? "");
                  setMode(initialMode);
                  setError(null);
                }
              }}
              className="h-8 w-full border border-rule bg-paper px-2.5 font-data outline-none"
            />
            {error && <p className="mt-1 text-err">{errorText(error, t)}</p>}
          </div>
        )}
      </div>
    </SettingRow>
  );
}
