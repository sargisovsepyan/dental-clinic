export const locales = ["hy", "ru", "en"] as const;
export type Locale = (typeof locales)[number];
export const primaryLocale: Locale = "hy";

export function isLocale(value: string): value is Locale {
  return locales.includes(value as Locale);
}

export function assertLocale(value: string): Locale {
  if (!isLocale(value)) throw new Error(`Unsupported locale: ${value}`);
  return value;
}

export const localeNames: Record<Locale, string> = {
  hy: "Հայերեն",
  ru: "Русский",
  en: "English",
};

export function localizedPath(locale: Locale, path = ""): Route {
  const clean = path.replace(/^\/+|\/+$/g, "");
  return (clean ? `/${locale}/${clean}` : `/${locale}`) as Route;
}

export function bookingPath(
  locale: Locale,
  selection: { service?: string; dentist?: string } = {},
): Route {
  const query = new URLSearchParams();
  if (selection.service && isCanonicalSlug(selection.service)) query.set("service", selection.service);
  if (selection.dentist && isCanonicalSlug(selection.dentist)) query.set("dentist", selection.dentist);
  const path = localizedPath(locale, "book");
  return (query.size ? `${path}?${query}` : path) as Route;
}

export function switchLocalePath(pathname: string, target: Locale): Route {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return localizedPath(target);
  if (isLocale(segments[0])) segments[0] = target;
  else return localizedPath(target);
  return `/${segments.join("/")}` as Route;
}

export function isCanonicalSlug(value: string) {
  return value.length >= 2 && value.length <= 180 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export function isObjectId(value: string) {
  return /^[0-9a-fA-F]{24}$/.test(value);
}
import type { Route } from "next";
