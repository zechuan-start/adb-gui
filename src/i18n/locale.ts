export const LOCALE_STORAGE_KEY = "locale";

export type Locale = "zh-CN" | "en";
export type LocalePreference = "system" | Locale;

export function isLocalePreference(value: unknown): value is LocalePreference {
  return value === "system" || value === "zh-CN" || value === "en";
}

export function resolveLocale(
  preference: LocalePreference,
  languages: readonly string[],
): Locale {
  if (preference !== "system") return preference;
  const first = languages.find((language) => language.length > 0);
  return first?.split("-")[0].toLowerCase() === "zh" ? "zh-CN" : "en";
}

export function systemLanguages(): readonly string[] {
  try {
    if (typeof navigator === "undefined") return [];
    return (
      navigator.languages ?? (navigator.language ? [navigator.language] : [])
    );
  } catch {
    // An inaccessible system preference follows the declared non-Chinese default.
    return [];
  }
}
