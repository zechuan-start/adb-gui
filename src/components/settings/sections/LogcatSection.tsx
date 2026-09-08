import { useT } from "@/i18n";
import {
  SettingRow,
  SettingsFieldset,
  SettingSwitchRow,
} from "@/components/settings/SettingRow";
import { ChipGroup } from "@/components/settings/controls/ChipGroup";
import { SegmentedControl } from "@/components/settings/controls/SegmentedControl";
import {
  columnsMatch,
  COMPACT_COLUMNS,
  LOGCAT_COLUMNS,
  STANDARD_COLUMNS,
  type LogcatColumn,
  type ViewFormat,
} from "@/lib/logcatView";
import { logcatPreset, STARTUP_OPTIONS } from "@/lib/settings";
import { useSettingsStore } from "@/store/settings";
import { useUiStore, type PaneId } from "@/store/ui";



export function LogcatSection() {
  const t = useT();
const FORMAT_OPTIONS: ReadonlyArray<{ value: ViewFormat; label: string }> = [
  { value: "standard", label: t.settings.logcat.standard },
  { value: "compact", label: t.settings.logcat.compact },
];

const COLUMN_OPTIONS: ReadonlyArray<{ value: LogcatColumn; label: string }> =
  LOGCAT_COLUMNS.map(({ column, label }) => ({ value: column, label }));

const LOG_PANE_OPTIONS = STARTUP_OPTIONS.filter(
  (item) => item.value !== "last",
);
  const preferences = useSettingsStore((s) => s.preferences);
  const available = useSettingsStore((s) => s.available);
  const update = useSettingsStore((s) => s.update);
  const logOpen = useUiStore((s) => s.logOpenByPane);
  const setLogOpen = useUiStore((s) => s.setLogOpen);
  const format = columnsMatch(preferences.logcat.columns, STANDARD_COLUMNS)
    ? "standard"
    : columnsMatch(preferences.logcat.columns, COMPACT_COLUMNS)
      ? "compact"
      : undefined;

  return (
    <>
      <SettingsFieldset available={available}>
        <SettingRow id="logcatFormat">
          <SegmentedControl
            value={format}
            options={FORMAT_OPTIONS}
            disabled={!available}
            ariaLabel={t.settings.rows.logcatFormat.label}
            onChange={(nextFormat) =>
              update("logcat", {
                ...preferences.logcat,
                columns: logcatPreset(nextFormat),
              })
            }
          />
        </SettingRow>
        <SettingRow id="logcatColumns" layout="stacked">
          <ChipGroup
            options={COLUMN_OPTIONS}
            selected={preferences.logcat.columns}
            disabled={!available}
            ariaLabel={t.settings.rows.logcatColumns.label}
            onToggle={(column, selected) =>
              update("logcat", {
                ...preferences.logcat,
                columns: {
                  ...preferences.logcat.columns,
                  [column]: selected,
                },
              })
            }
          />
        </SettingRow>
        <SettingSwitchRow
          id="softWrap"
          checked={preferences.logcat.softWrap}
          disabled={!available}
          onChange={(softWrap) =>
            update("logcat", { ...preferences.logcat, softWrap })
          }
        />
        <SettingSwitchRow
          id="autoFold"
          checked={preferences.logcat.autoFold}
          disabled={!available}
          onChange={(autoFold) =>
            update("logcat", { ...preferences.logcat, autoFold })
          }
        />
        <SettingSwitchRow
          id="cozyRows"
          checked={preferences.logcat.cozyRows}
          disabled={!available}
          onChange={(cozyRows) =>
            update("logcat", { ...preferences.logcat, cozyRows })
          }
        />
      </SettingsFieldset>
      {/* Pane visibility belongs to the window store and remains editable. */}
      <SettingRow id="logPanes" layout="stacked">
        <ChipGroup
          options={LOG_PANE_OPTIONS.map(option => ({ value: option.value as PaneId, label: option.label(t) }))}
          selected={logOpen}
          ariaLabel={t.settings.rows.logPanes.label}
          onToggle={setLogOpen}
        />
      </SettingRow>
    </>
  );
}
