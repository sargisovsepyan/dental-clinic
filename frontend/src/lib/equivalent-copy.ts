import type { Locale } from "@/i18n/locales";

export function normalizeDisplayCopy(value: string, locale: Locale) {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase(locale);
}

export function isEquivalentDisplayCopy(first: string, second: string, locale: Locale) {
  return normalizeDisplayCopy(first, locale) === normalizeDisplayCopy(second, locale);
}
