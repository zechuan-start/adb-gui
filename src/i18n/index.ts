import { useLocaleStore } from "@/store/locale";

export type { Locale, LocalePreference } from "./locale";
export type { Message, Messages } from "./types";
export { errorText, translateError } from "./errors";

export function useT() {
  return useLocaleStore((state) => state.messages);
}

export function useLocale() {
  return useLocaleStore((state) => state.locale);
}

export function messages() {
  return useLocaleStore.getState().messages;
}
