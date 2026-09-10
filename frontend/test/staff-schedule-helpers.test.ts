import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  clinicLocalDate,
  isRealLocalDate,
  normalizeWeeklySchedule,
  serializeWeeklySchedule,
  validateScheduleDays,
} from "@/components/staff/staff-schedule-helpers";

describe("staff schedule helpers", () => {
  it("renders all seven weekdays and treats omitted days as closed", () => {
    const days = normalizeWeeklySchedule([
      { dayOfWeek: 1, isOpen: true, shifts: [{ start: "09:00", end: "18:00" }] },
    ], "clinic");
    expect(days).toHaveLength(7);
    expect(days[0]).toMatchObject({ enabled: true });
    expect(days.slice(1).every((day) => !day.enabled && day.shifts.length === 0)).toBe(true);
    expect(serializeWeeklySchedule(days, "clinic")).toHaveLength(7);
  });

  it("accepts adjacent shifts, sorts them, and rejects overlap or inverted intervals", () => {
    const base = Array.from({ length: 7 }, (_, index) => ({
      dayOfWeek: index + 1,
      enabled: index === 0,
      shifts: index === 0 ? [{ start: "13:00", end: "17:00" }, { start: "09:00", end: "13:00" }] : [],
    }));
    expect(validateScheduleDays(base)).toBe(true);
    expect(serializeWeeklySchedule(base, "dentist")[0].shifts).toEqual([
      { start: "09:00", end: "13:00" }, { start: "13:00", end: "17:00" },
    ]);
    expect(validateScheduleDays(base.map((day, index) => index === 0 ? {
      ...day, shifts: [{ start: "09:00", end: "14:00" }, { start: "13:00", end: "17:00" }],
    } : day))).toBe(false);
    expect(validateScheduleDays(base.map((day, index) => index === 0 ? {
      ...day, shifts: [{ start: "17:00", end: "09:00" }],
    } : day))).toBe(false);
  });

  it("derives clinic dates from the configured timezone and performs calendar-only range arithmetic", () => {
    const instant = new Date("2026-03-08T03:30:00.000Z");
    expect(clinicLocalDate("America/New_York", instant)).toBe("2026-03-07");
    expect(clinicLocalDate("Asia/Yerevan", instant)).toBe("2026-03-08");
    expect(addCalendarDays("2026-03-07", 2)).toBe("2026-03-09");
    expect(isRealLocalDate("2026-02-29")).toBe(false);
    expect(isRealLocalDate("2028-02-29")).toBe(true);
  });
});
