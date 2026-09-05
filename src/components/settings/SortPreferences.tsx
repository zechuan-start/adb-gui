import { ArrowDown, ArrowUp, Settings } from "lucide-react";
import { BlueprintSelect } from "@/components/BlueprintSelect";
import { APP_SORT_OPTIONS, FILE_SORT_OPTIONS } from "@/lib/settings";
import { useSettingsStore } from "@/store/settings";
import { useUiStore } from "@/store/ui";

export function SortPreferences({
  section,
  showSettings = false,
}: {
  section: "files" | "apps";
  showSettings?: boolean;
}) {
  const preferences = useSettingsStore((state) => state.preferences[section]);
  const available = useSettingsStore((state) => state.available);
  const update = useSettingsStore((state) => state.update);
  const openSettings = useUiStore((state) => state.openSettings);
  const ascending = preferences.sortDirection === "asc";
  const label = section === "files" ? "文件" : "应用";
  const buttonClass =
    "flex h-7 w-7 shrink-0 items-center justify-center border border-rule text-ink2 hover:bg-hover disabled:opacity-40";

  return (
    <div className="flex shrink-0 items-center gap-1">
      <BlueprintSelect
        value={preferences.sortBy}
        options={section === "files" ? FILE_SORT_OPTIONS : APP_SORT_OPTIONS}
        disabled={!available}
        ariaLabel={`${label}排序`}
        containerClassName="w-28"
        onValueChange={(value) => {
          const settings = useSettingsStore.getState().preferences;
          if (section === "files") {
            const option = FILE_SORT_OPTIONS.find(
              (item) => item.value === value,
            );
            if (option)
              update("files", { ...settings.files, sortBy: option.value });
          } else {
            const option = APP_SORT_OPTIONS.find(
              (item) => item.value === value,
            );
            if (option)
              update("apps", { ...settings.apps, sortBy: option.value });
          }
        }}
      />
      <button
        type="button"
        disabled={!available}
        className={buttonClass}
        title={ascending ? "升序, 切换为降序" : "降序, 切换为升序"}
        aria-label={`${label}${ascending ? "升序, 切换为降序" : "降序, 切换为升序"}`}
        onClick={() =>
          update(section, {
            ...useSettingsStore.getState().preferences[section],
            sortDirection: ascending ? "desc" : "asc",
          })
        }
      >
        {ascending ? (
          <ArrowUp className="h-3.5 w-3.5" />
        ) : (
          <ArrowDown className="h-3.5 w-3.5" />
        )}
      </button>
      {showSettings && (
        <button
          type="button"
          title={`${label}设置`}
          aria-label={`${label}设置`}
          className={buttonClass}
          onClick={() => openSettings(section)}
        >
          <Settings className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
