import type { Locale } from "./locale";

function perLocale<T>(create: (locale: Locale) => T): (locale: Locale) => T {
  const cache = new Map<Locale, T>();
  return (locale) => {
    let value = cache.get(locale);
    if (value === undefined) {
      value = create(locale);
      cache.set(locale, value);
    }
    return value;
  };
}

export const numbers = perLocale((locale) => new Intl.NumberFormat(locale));
export const dateTime = perLocale(
  (locale) =>
    new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
);
export const timeOfDay = perLocale(
  (locale) =>
    new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }),
);
export const appNameCollator = perLocale(
  (locale) =>
    new Intl.Collator(locale, {
      numeric: true,
      sensitivity: "base",
    }),
);
