import { useT } from "@/i18n";
import { ArrowDown, ArrowUp, Settings } from "lucide-react";
import { BlueprintSelect } from "@/components/BlueprintSelect";
import { SettingRow } from "@/components/settings/SettingRow";
import { SegmentedControl } from "@/components/settings/controls/SegmentedControl";
import {
  APP_SORT_OPTIONS,
  FILE_SORT_OPTIONS,
  SORT_DIRECTIONS,
  type SortDirection,
} from "@/lib/settings";
import { useSettingsStore } from "@/store/settings";
import { useUiStore } from "@/store/ui";

type SortSection = "files" | "apps";

export function setSortBy(section: SortSection, value: string): void {
  const store = useSettingsStore.getState();
  if (section === "files") {
    const option = FILE_SORT_OPTIONS.find((item) => item.value === value);
    if (option) {
      store.update("files", { ...store.preferences.files, sortBy: option.value });
    }
    return;
  }
  const option = APP_SORT_OPTIONS.find((item) => item.value === value);
  if (option) {
    store.update("apps", { ...store.preferences.apps, sortBy: option.value });
  }
}

export function setSortDirection(
  section: SortSection,
  sortDirection: SortDirection,
): void {
  const store = useSettingsStore.getState();
  store.update(section, {
    ...store.preferences[section],
    sortDirection,
  });
}

export function SortPreferences({
  section,
  showSettings = false,
}: {
  section: SortSection;
  showSettings?: boolean;
}) {
  const t = useT();
  const preferences = useSettingsStore((state) => state.preferences[section]);
  const available = useSettingsStore((state) => state.available);
  const openSettings = useUiStore((state) => state.openSettings);
  const ascending = preferences.sortDirection === "asc";
  const label = section === "files" ? t.shell.workspace.files : t.shell.workspace.apps;
  const buttonClass =
    "flex h-7 w-7 shrink-0 items-center justify-center border border-rule text-ink2 hover:bg-hover disabled:opacity-40";

  return (
    <div className="flex shrink-0 items-center gap-1">
      <BlueprintSelect
        value={preferences.sortBy}
        options={(section === "files" ? FILE_SORT_OPTIONS : APP_SORT_OPTIONS).map(option => ({ ...option, label: option.label(t) }))}
        disabled={!available}
        ariaLabel={t.settings.sort.by({ label })}
        containerClassName="w-28"
        onValueChange={(value) => setSortBy(section, value)}
      />
      <button
        type="button"
        disabled={!available}
        className={buttonClass}
        title={ascending ? t.settings.sort.ascendingAction : t.settings.sort.descendingAction}
        aria-label={t.settings.sort.action({ label, action: ascending ? t.settings.sort.ascendingAction : t.settings.sort.descendingAction })}
        onClick={() =>
          setSortDirection(section, ascending ? "desc" : "asc")
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
          title={t.settings.sort.settings({ label })}
          aria-label={t.settings.sort.settings({ label })}
          className={buttonClass}
          onClick={() => openSettings(section)}
        >
          <Settings className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function SortRow({ section }: { section: SortSection }) {
  const t = useT();
  const preferences = useSettingsStore((state) => state.preferences[section]);
  const available = useSettingsStore((state) => state.available);
  const label = section === "files" ? t.shell.workspace.files : t.shell.workspace.apps;

  return (
    <SettingRow id={section === "files" ? "fileSort" : "appSort"}>
      <div className="flex min-w-0 items-center gap-2">
        <BlueprintSelect
          value={preferences.sortBy}
          options={(section === "files" ? FILE_SORT_OPTIONS : APP_SORT_OPTIONS).map(option => ({ ...option, label: option.label(t) }))}
          disabled={!available}
          ariaLabel={t.settings.sort.field({ label })}
          containerClassName="w-32"
          className="h-8"
          onValueChange={(value) => setSortBy(section, value)}
        />
        <SegmentedControl
          value={preferences.sortDirection}
          options={SORT_DIRECTIONS.map(option => ({ ...option, label: option.label(t) }))}
          disabled={!available}
          ariaLabel={t.settings.sort.direction({ label })}
          onChange={(value) => setSortDirection(section, value)}
        />
      </div>
    </SettingRow>
  );
}
