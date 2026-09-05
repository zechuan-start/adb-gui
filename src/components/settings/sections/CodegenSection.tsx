import { GeneratorPreferences } from "@/components/settings/GeneratorPreferences";
import { SettingsGroup } from "@/components/settings/SettingRow";

// The generator block is shared with the codegen workspace and already scopes
// its own fieldset, so the section only adds search filtering around it.
export function CodegenSection() {
  return (
    <SettingsGroup rowIds={["codeType", "separator"]}>
      <GeneratorPreferences id="settings-code-separator" />
    </SettingsGroup>
  );
}
