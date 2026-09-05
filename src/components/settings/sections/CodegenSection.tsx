import { GeneratorPreferences } from "@/components/settings/GeneratorPreferences";

// GeneratorPreferences already scopes its own fieldset to the settings store.
export function CodegenSection() {
  return <GeneratorPreferences id="settings-code-separator" />;
}
