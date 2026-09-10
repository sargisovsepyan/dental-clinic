import type { ClinicWorkingDay, DentistWorkingDay, Shift } from "@/api/staff-management";

export type ScheduleKind = "clinic" | "dentist";
export type ScheduleDay = {
  dayOfWeek: number;
  enabled: boolean;
  shifts: Shift[];
};

export function normalizeWeeklySchedule(
  schedule: ClinicWorkingDay[] | DentistWorkingDay[],
  kind: ScheduleKind,
): ScheduleDay[] {
  return Array.from({ length: 7 }, (_, index) => {
    const dayOfWeek = index + 1;
    const existing = schedule.find((day) => day.dayOfWeek === dayOfWeek);
    const enabled = existing
      ? kind === "clinic" ? (existing as ClinicWorkingDay).isOpen : (existing as DentistWorkingDay).isWorking
      : false;
    return {
      dayOfWeek,
      enabled,
      shifts: enabled && existing ? existing.shifts.map((shift) => ({ ...shift })) : [],
    };
  });
}

export function validateScheduleDays(days: ScheduleDay[]) {
  if (days.length !== 7 || new Set(days.map((day) => day.dayOfWeek)).size !== 7) return false;
  return days.every((day) => {
    if (!day.enabled) return day.shifts.length === 0;
    if (day.shifts.length < 1 || day.shifts.length > 6) return false;
    const ordered = [...day.shifts].sort((first, second) => first.start.localeCompare(second.start));
    return ordered.every((shift, index) =>
      /^([01]\d|2[0-3]):[0-5]\d$/.test(shift.start) &&
      /^([01]\d|2[0-3]):[0-5]\d$/.test(shift.end) &&
      shift.start < shift.end &&
      (index === 0 || ordered[index - 1].end <= shift.start),
    );
  });
}

export function serializeWeeklySchedule(days: ScheduleDay[], kind: ScheduleKind) {
  return days.map((day) => ({
    dayOfWeek: day.dayOfWeek,
    [kind === "clinic" ? "isOpen" : "isWorking"]: day.enabled,
    shifts: day.enabled
      ? [...day.shifts].sort((first, second) => first.start.localeCompare(second.start)).map((shift) => ({ ...shift }))
      : [],
  })) as ClinicWorkingDay[] | DentistWorkingDay[];
}

export function clinicLocalDate(timezone: string, instant = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function addCalendarDays(date: string, days: number) {
  const instant = new Date(`${date}T12:00:00.000Z`);
  instant.setUTCDate(instant.getUTCDate() + days);
  return instant.toISOString().slice(0, 10);
}

export function isRealLocalDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const instant = new Date(`${value}T12:00:00.000Z`);
  return Number.isFinite(instant.getTime()) && instant.toISOString().slice(0, 10) === value;
}
