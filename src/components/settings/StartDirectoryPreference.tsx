import { useEffect, useState } from "react";
import { BlueprintSelect } from "@/components/BlueprintSelect";
import { deviceStartDirectoryError } from "@/lib/settings";
import { useSettingsStore } from "@/store/settings";

const PRESETS = [
  { value: "download", label: "下载目录", path: null },
  { value: "storage", label: "内部存储", path: "/sdcard" },
  { value: "camera", label: "相机目录", path: "/sdcard/DCIM/Camera" },
] as const;
const OPTIONS = [...PRESETS, { value: "custom", label: "自定义" }];

export function StartDirectoryPreference() {
  const path = useSettingsStore(
    (state) => state.preferences.files.startDirectory,
  );
  const initialMode =
    PRESETS.find((option) => option.path === path)?.value ?? "custom";
  const [mode, setMode] = useState<string>(initialMode);
  const [draft, setDraft] = useState(path ?? "");
  const [error, setError] = useState<string | null>(null);

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
    <div className="border-b border-rule py-3 text-xs">
      <div className="flex min-h-8 items-center justify-between gap-4">
        <span>设备起始目录</span>
        <BlueprintSelect
          value={mode}
          options={OPTIONS}
          ariaLabel="设备起始目录"
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
      </div>
      {mode === "custom" && (
        <div className="mt-2">
          <input
            value={draft}
            aria-label="自定义设备起始目录"
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
          {error && <p className="mt-1 text-err">{error}</p>}
        </div>
      )}
    </div>
  );
}
