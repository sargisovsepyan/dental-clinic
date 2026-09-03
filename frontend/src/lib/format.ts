import type { Locale } from "@/i18n/locales";
import type { Messages } from "@/i18n/messages";

const intlLocale: Record<Locale, string> = { hy: "hy-AM", ru: "ru-RU", en: "en-US" };

const money = (locale: Locale, value: number) =>
  new Intl.NumberFormat(intlLocale[locale], {
    style: "currency",
    currency: "AMD",
    maximumFractionDigits: 0,
  }).format(value);

export function formatPrice(
  locale: Locale,
  copy: Messages,
  price: {
    priceType: "fixed" | "from" | "range" | "on_request";
    priceFrom: number | null;
    priceTo: number | null;
  },
) {
  if (price.priceType === "fixed" && price.priceFrom !== null) return money(locale, price.priceFrom);
  if (price.priceType === "from" && price.priceFrom !== null) return `${copy.from} ${money(locale, price.priceFrom)}`;
  if (price.priceType === "range" && price.priceFrom !== null && price.priceTo !== null) {
    return `${money(locale, price.priceFrom)} – ${money(locale, price.priceTo)}`;
  }
  return copy.priceOnRequest;
}

export function weekdayLabel(locale: Locale, day: number) {
  const keys = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
  const key = keys[day - 1];
  return key ? key : "monday";
}
