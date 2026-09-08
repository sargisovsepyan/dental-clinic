import type { StaffAppointment, StaffAppointmentStatus } from "@/api/staff-client";
import type { Locale } from "@/i18n/locales";
import type { StaffMessages } from "@/i18n/staff-messages";

export const transitions: Record<StaffAppointmentStatus, StaffAppointmentStatus[]> = {
  pending: ["confirmed", "no_show"],
  confirmed: ["checked_in", "no_show"],
  checked_in: ["in_progress"],
  in_progress: ["completed"],
  completed: [],
  cancelled: [],
  no_show: [],
};

export const cancellable = new Set<StaffAppointmentStatus>(["pending", "confirmed", "checked_in", "in_progress"]);
export const reschedulable = new Set<StaffAppointmentStatus>(["pending", "confirmed"]);

export function statusLabel(status: StaffAppointmentStatus, copy: StaffMessages) {
  const labels: Record<StaffAppointmentStatus, string> = {
    pending: copy.statusPending,
    confirmed: copy.statusConfirmed,
    checked_in: copy.statusCheckedIn,
    in_progress: copy.statusInProgress,
    completed: copy.statusCompleted,
    cancelled: copy.statusCancelled,
    no_show: copy.statusNoShow,
  };
  return labels[status];
}

export function statusClass(status: StaffAppointmentStatus) {
  if (status === "completed") return "bg-emerald-100 text-emerald-900";
  if (status === "cancelled" || status === "no_show") return "bg-stone-200 text-stone-800";
  if (status === "in_progress" || status === "checked_in") return "bg-sky-100 text-sky-900";
  if (status === "confirmed") return "bg-teal-100 text-teal-900";
  return "bg-amber-100 text-amber-950";
}

export function referenceId(value: StaffAppointment["dentist"] | StaffAppointment["service"]) {
  return typeof value === "string" ? value : value._id;
}

export function formatClinicDate(date: string, locale: Locale) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(locale === "hy" ? "hy-AM" : locale === "ru" ? "ru-RU" : "en-US", {
    year: "numeric", month: "short", day: "numeric", timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export function formatClinicTimestamp(value: string, locale: Locale, timezone: string) {
  return new Intl.DateTimeFormat(locale === "hy" ? "hy-AM" : locale === "ru" ? "ru-RU" : "en-US", {
    dateStyle: "medium", timeStyle: "short", timeZone: timezone,
  }).format(new Date(value));
}
