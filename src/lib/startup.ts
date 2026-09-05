import type { SettingsPreferences } from "@/lib/settings";
import type { PaneId } from "@/store/ui";

export function applyStartupPane(
  settings: SettingsPreferences | null,
  setPane: (pane: PaneId) => void,
) {
  if (settings && settings.general.startupPane !== "last")
    setPane(settings.general.startupPane);
}

// Keep one request across StrictMode effects. Disabling invalidates this launch permanently.
export function createStartupCheck<T>(
  enabled: boolean,
  check: () => Promise<T>,
) {
  let allowed = enabled;
  let request: Promise<T> | undefined;
  return {
    disable: () => {
      allowed = false;
    },
    async run(): Promise<T | null> {
      if (!allowed) return null;
      request ??= check();
      const result = await request;
      return allowed ? result : null;
    },
  };
}
