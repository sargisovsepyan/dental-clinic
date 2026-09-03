import type { Metadata } from "next";
import { locales, localizedPath, type Locale } from "@/i18n/locales";

const openGraphLocales: Record<Locale, string> = {
  hy: "hy_AM",
  ru: "ru_RU",
  en: "en_US",
};

export function localeAlternates(locale: Locale, path = ""): Metadata["alternates"] {
  return {
    canonical: localizedPath(locale, path),
    languages: Object.fromEntries(
      locales.map((item) => [item, localizedPath(item, path)]),
    ),
  };
}

export function publicMetadata(options: {
  locale: Locale;
  path?: string;
  title: string;
  description?: string;
  image?: string;
  clearImageWhenMissing?: boolean;
}): Metadata {
  const description = options.description || undefined;
  const image = options.image || (options.clearImageWhenMissing ? undefined : "/og.png");
  const images = image ? [{ url: image }] : [];
  return {
    title: options.title,
    description,
    alternates: localeAlternates(options.locale, options.path),
    openGraph: {
      type: "website",
      locale: openGraphLocales[options.locale],
      alternateLocale: locales
        .filter((locale) => locale !== options.locale)
        .map((locale) => openGraphLocales[locale]),
      title: options.title,
      description,
      images,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: options.title,
      description,
      images,
    },
  };
}
