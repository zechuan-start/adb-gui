import {
  SettingRow,
  SettingsFieldset,
  SettingsGroup,
  SettingsRowGate,
  SettingToggle,
} from "@/components/settings/SettingRow";
import {
  columnsMatch,
  COMPACT_COLUMNS,
  LOGCAT_COLUMNS,
  STANDARD_COLUMNS,
} from "@/lib/logcatView";
import { logcatPreset, STARTUP_OPTIONS } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/store/settings";
import { useUiStore, type PaneId } from "@/store/ui";

const DISPLAY_ROWS = [
  "logcatFormat",
  "logcatColumns",
  "softWrap",
  "autoFold",
  "cozyRows",
];

export function LogcatSection() {
  const preferences = useSettingsStore((s) => s.preferences);
  const available = useSettingsStore((s) => s.available);
  const update = useSettingsStore((s) => s.update);
  const logOpen = useUiStore((s) => s.logOpenByPane);
  const setLogOpen = useUiStore((s) => s.setLogOpen);

  return (
    <>
      <SettingsGroup title="显示" rowIds={DISPLAY_ROWS}>
        <SettingsFieldset available={available}>
          <SettingRow id="logcatFormat">
            <div
              className="flex border border-rule"
              role="group"
              aria-label="显示格式"
            >
              {(["standard", "compact"] as const).map((format) => (
                <button
                  type="button"
                  key={format}
                  aria-pressed={columnsMatch(
                    preferences.logcat.columns,
                    format === "standard" ? STANDARD_COLUMNS : COMPACT_COLUMNS,
                  )}
                  onClick={() =>
                    update("logcat", {
                      ...preferences.logcat,
                      columns: logcatPreset(format),
                    })
                  }
                  className={cn(
                    "h-8 border-r border-rule px-4 text-xs last:border-r-0 hover:bg-hover",
                    columnsMatch(
                      preferences.logcat.columns,
                      logcatPreset(format),
                    ) && "bg-ink text-onink hover:bg-ink",
                  )}
                >
                  {format === "standard" ? "标准" : "紧凑"}
                </button>
              ))}
            </div>
          </SettingRow>
          <SettingsRowGate id="logcatColumns">
            <div
              className="grid grid-cols-2 gap-x-6 border-b border-rule py-2"
              role="group"
              aria-label="显示列"
            >
              {LOGCAT_COLUMNS.map(({ column, label }) => (
                <label
                  key={column}
                  className="flex min-h-9 items-center gap-2 text-xs"
                >
                  <input
                    type="checkbox"
                    checked={preferences.logcat.columns[column]}
                    onChange={(event) =>
                      update("logcat", {
                        ...preferences.logcat,
                        columns: {
                          ...preferences.logcat.columns,
                          [column]: event.currentTarget.checked,
                        },
                      })
                    }
                    className="h-3.5 w-3.5 accent-ink"
                  />
                  {label}
                </label>
              ))}
            </div>
          </SettingsRowGate>
          <SettingToggle
            id="softWrap"
            checked={preferences.logcat.softWrap}
            onChange={(softWrap) =>
              update("logcat", { ...preferences.logcat, softWrap })
            }
          />
          <SettingToggle
            id="autoFold"
            checked={preferences.logcat.autoFold}
            onChange={(autoFold) =>
              update("logcat", { ...preferences.logcat, autoFold })
            }
          />
          <SettingToggle
            id="cozyRows"
            checked={preferences.logcat.cozyRows}
            onChange={(cozyRows) =>
              update("logcat", { ...preferences.logcat, cozyRows })
            }
          />
        </SettingsFieldset>
      </SettingsGroup>
      {/* Pane visibility belongs to the window store, so it survives a broken settings file. */}
      <SettingsGroup title="显示日志的工作区" rowIds={["logPanes"]}>
        <div className="grid grid-cols-2 gap-x-6">
          {STARTUP_OPTIONS.filter(
            (item): item is { value: PaneId; label: string } =>
              item.value !== "last",
          ).map(({ value, label }) => (
            <label
              key={value}
              className="flex min-h-9 items-center gap-2 text-xs"
            >
              <input
                type="checkbox"
                checked={logOpen[value]}
                onChange={(event) =>
                  setLogOpen(value, event.currentTarget.checked)
                }
                className="h-3.5 w-3.5 accent-ink"
              />
              {label}
            </label>
          ))}
        </div>
      </SettingsGroup>
    </>
  );
}
