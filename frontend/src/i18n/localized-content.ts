import { primaryLocale, type Locale } from "@/i18n/locales";

type TranslationMap<T> = Partial<Record<Locale, Partial<T> | undefined>> | undefined;

export interface LocalizedValue<T> {
  value: T | undefined;
  resolvedLocale: Locale | undefined;
}

export function selectLocalizedField<T extends object, K extends keyof T>(
  translations: TranslationMap<T>,
  locale: Locale,
  field: K,
): LocalizedValue<T[K]> {
  const requested = translations?.[locale]?.[field];
  if (requested !== undefined) return { value: requested, resolvedLocale: locale };

  const fallback = translations?.[primaryLocale]?.[field];
  if (fallback !== undefined) return { value: fallback, resolvedLocale: primaryLocale };

  return { value: undefined, resolvedLocale: undefined };
}
