import { CaptureDirectoryPreference } from "@/components/settings/CaptureDirectoryPreference";
import {
  SettingsFieldset,
  SettingsGroup,
  SettingsRowGate,
  SettingToggle,
} from "@/components/settings/SettingRow";
import { useSettingsStore } from "@/store/settings";

export function CaptureSection() {
  const preferences = useSettingsStore((s) => s.preferences);
  const available = useSettingsStore((s) => s.available);
  const update = useSettingsStore((s) => s.update);

  return (
    <SettingsFieldset available={available}>
      <SettingsGroup title="保存位置" rowIds={["captureDirectory"]}>
        <SettingsRowGate id="captureDirectory">
          <CaptureDirectoryPreference />
        </SettingsRowGate>
      </SettingsGroup>
      <SettingsGroup
        title="截图"
        rowIds={["screenshotOpen", "screenshotReveal"]}
      >
        <SettingToggle
          id="screenshotOpen"
          checked={preferences.screenshot.openAfterSave}
          onChange={(openAfterSave) =>
            update("screenshot", { ...preferences.screenshot, openAfterSave })
          }
        />
        <SettingToggle
          id="screenshotReveal"
          checked={preferences.screenshot.revealAfterSave}
          onChange={(revealAfterSave) =>
            update("screenshot", { ...preferences.screenshot, revealAfterSave })
          }
        />
      </SettingsGroup>
      <SettingsGroup title="录屏" rowIds={["recordingOpen"]}>
        <SettingToggle
          id="recordingOpen"
          checked={preferences.recording.openAfterSave}
          onChange={(openAfterSave) => update("recording", { openAfterSave })}
        />
      </SettingsGroup>
    </SettingsFieldset>
  );
}
