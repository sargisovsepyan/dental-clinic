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

// Public display never silently substitutes another language. The legacy helper
// above remains available to explicitly primary-locale editorial/migration tools.
export function selectPublishedField<T extends object, K extends keyof T>(
  translations: TranslationMap<T>, locale: Locale, field: K,
): LocalizedValue<T[K]> {
  const value = translations?.[locale]?.[field];
  return { value, resolvedLocale: value === undefined ? undefined : locale };
}

export function localizedPersonName(person: {
  firstName: string; lastName: string;
  translations?: unknown;
}, locale: Locale) {
  const entry = person.translations && typeof person.translations === 'object'
    ? (person.translations as Record<string, unknown>)[locale] : undefined;
  const names = entry && typeof entry === 'object' ? entry as Record<string, unknown> : undefined;
  if (typeof names?.firstName === 'string' && typeof names?.lastName === 'string' && names.firstName && names.lastName) return `${names.firstName} ${names.lastName}`;
  return locale === 'hy' ? `${person.firstName} ${person.lastName}`.trim() : '';
}

export function localizedStaffName(user: { name: string; nameTranslations?: Partial<Record<Locale, string>> }, locale: Locale) {
  return user.nameTranslations?.[locale] || user.name;
}
