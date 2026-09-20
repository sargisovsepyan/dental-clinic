import type { Locale } from "@/i18n/locales";

import { isCalendarDate } from '../../../shared/booking-input.mjs';
export { isCalendarDate, isBookingDate } from '../../../shared/booking-input.mjs';

const calendarLabels: Record<Locale, { weekdays: string[]; months: string[] }> = {
  hy: {
    weekdays: ["կիրակի", "երկուշաբթի", "երեքշաբթի", "չորեքշաբթի", "հինգշաբթի", "ուրբաթ", "շաբաթ"],
    months: ["հունվարի", "փետրվարի", "մարտի", "ապրիլի", "մայիսի", "հունիսի", "հուլիսի", "օգոստոսի", "սեպտեմբերի", "հոկտեմբերի", "նոյեմբերի", "դեկտեմբերի"],
  },
  ru: {
    weekdays: ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"],
    months: ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
  },
  en: {
    weekdays: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  },
};

export function clinicLocalDate(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const year = get("year");
  const month = get("month");
  const day = get("day");
  if (!year || !month || !day) throw new Error("Clinic timezone date could not be resolved");
  return `${year}-${month}-${day}`;
}

export function addCalendarDays(date: string, days: number) {
  if (!isCalendarDate(date) || !Number.isInteger(days)) throw new Error('Invalid calendar date');
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function bookingDateRange(options: {
  timezone: string;
  allowSameDay: boolean;
  maxDaysAhead: number;
  now?: Date;
}) {
  const today = clinicLocalDate(options.timezone, options.now);
  return {
    min: addCalendarDays(today, options.allowSameDay ? 0 : 1),
    max: addCalendarDays(today, options.maxDaysAhead),
  };
}

export function formatBookingDate(date: string, locale: Locale, timezone: string) {
  void timezone;
  if (!isCalendarDate(date)) return '—';
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(`${date}T12:00:00.000Z`).getUTCDay();
  const labels = calendarLabels[locale];
  if (locale === "hy") return `${labels.weekdays[weekday]}, ${day} ${labels.months[month - 1]} ${year} թ.`;
  if (locale === "ru") return `${labels.weekdays[weekday]}, ${day} ${labels.months[month - 1]} ${year} г.`;
  return `${labels.weekdays[weekday]}, ${labels.months[month - 1]} ${day}, ${year}`;
}
