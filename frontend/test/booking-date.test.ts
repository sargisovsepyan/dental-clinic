import { describe, expect, it } from "vitest";
import { addCalendarDays, bookingDateRange, clinicLocalDate, formatBookingDate, isBookingDate, isCalendarDate } from "@/lib/booking-date";

describe("booking calendar helpers", () => {
  it("resolves the clinic-local date across a UTC boundary", () => {
    expect(clinicLocalDate("Asia/Yerevan", new Date("2026-09-03T21:30:00Z"))).toBe("2026-09-04");
  });

  it("adds calendar days across month and leap-year boundaries", () => {
    expect(addCalendarDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("honors same-day policy and the inclusive maximum horizon", () => {
    expect(bookingDateRange({ timezone: "Asia/Yerevan", allowSameDay: false, maxDaysAhead: 60, now: new Date("2026-09-03T08:00:00Z") })).toEqual({ min: "2026-09-04", max: "2026-11-02" });
  });

  it("formats dates from explicit locale data without ICU fallback", () => {
    expect(formatBookingDate("2026-10-09", "hy", "Asia/Yerevan")).toBe("ուրբաթ, 9 հոկտեմբերի 2026 թ.");
    expect(formatBookingDate("2026-10-09", "ru", "Asia/Yerevan")).toBe("пятница, 9 октября 2026 г.");
    expect(formatBookingDate("2026-10-09", "en", "Asia/Yerevan")).toBe("Friday, October 9, 2026");
  });

  it("rejects impossible, low-year, past, and beyond-horizon values before formatting or submission", () => {
    const range = { min: "2026-09-01", max: "2026-10-31" };
    for (const value of ["0001-01-01", "0002-02-28", "2026-02-29", "2026-09-31", "2026-08-31", "2026-11-01"]) {
      expect(isBookingDate(value, range), value).toBe(false);
    }
    expect(isCalendarDate("0001-01-01")).toBe(true);
    expect(formatBookingDate("2026-02-29", "en", "Asia/Yerevan")).toBe("—");
    expect(() => addCalendarDays("2026-02-29", 1)).toThrow("Invalid calendar date");
  });
});
