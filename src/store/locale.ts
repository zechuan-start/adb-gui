import { create } from "zustand";
import { CATALOGS } from "@/i18n/messages";
import {
  isLocalePreference,
  LOCALE_STORAGE_KEY,
  resolveLocale,
  systemLanguages,
  type Locale,
  type LocalePreference,
} from "@/i18n/locale";
import type { Messages } from "@/i18n/types";

interface LocaleState {
  preference: LocalePreference;
  locale: Locale;
  messages: Messages;
  setPreference: (preference: LocalePreference) => void;
}

function persistLocale(preference: LocalePreference): void {
  try {
    globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, preference);
  } catch {
    // Like theme, this shell preference remains usable when storage is unavailable.
  }
}

function readPreference(): LocalePreference {
  try {
    const value = globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY) ?? null;
    if (isLocalePreference(value)) return value;
    if (value !== null) persistLocale("system");
  } catch {
    // Missing and unreadable preferences both use the system language.
  }
  return "system";
}

function applyLocale(preference: LocalePreference) {
  const locale = resolveLocale(preference, systemLanguages());
  if (typeof document !== "undefined") document.documentElement.lang = locale;
  return { preference, locale, messages: CATALOGS[locale] };
}

export const useLocaleStore = create<LocaleState>((set) => ({
  ...applyLocale(readPreference()),
  setPreference: (preference) => {
    persistLocale(preference);
    set(applyLocale(preference));
  },
}));

function handleLanguageChange(): void {
  if (useLocaleStore.getState().preference === "system") {
    useLocaleStore.setState(applyLocale("system"));
  }
}

if (
  typeof window !== "undefined" &&
  typeof window.addEventListener === "function"
) {
  window.addEventListener("languagechange", handleLanguageChange);
}

export function disposeLocaleListener(): void {
  if (
    typeof window !== "undefined" &&
    typeof window.removeEventListener === "function"
  ) {
    window.removeEventListener("languagechange", handleLanguageChange);
  }
}

if (import.meta.hot) import.meta.hot.dispose(disposeLocaleListener);
