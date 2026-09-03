import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BookingApiError,
  canonicalBookingPayload,
  createIdempotencyKey,
  createPublicAppointment,
  getAvailability,
  type BookingPayload,
} from "@/api/booking-client";

const payload: BookingPayload = {
  patientName: "  Test Patient  ",
  patientPhone: " 012345678 ",
  patientEmail: " TEST@EXAMPLE.COM ",
  patientComment: "  Please call  ",
  dentistId: "64b000000000000000000021",
  serviceId: "64b000000000000000000011",
  date: "2026-09-10",
  startTime: "09:00",
  locale: "en",
  privacyAccepted: true,
  challengeToken: "challenge-token-one",
};

const appointment = {
  id: "64b000000000000000000071",
  confirmationCode: "DC-0123456789ABCDEF",
  patientName: "Test Patient",
  date: "2026-09-10",
  startTime: "09:00",
  endTime: "10:00",
  status: "pending",
  dentist: { id: payload.dentistId, firstName: "Ani", lastName: "Test" },
  service: { id: payload.serviceId, name: "Cleaning", durationMinutes: 60 },
  price: { priceType: "from", priceFrom: 20_000, priceTo: null, currency: "AMD" },
};

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:5000/api/v1";
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
  process.env.NEXT_PUBLIC_BOOKING_CHALLENGE_PROVIDER = "disabled";
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("booking API client", () => {
  it("builds a no-store availability request and allowlists validated slots", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: { availability: {
        date: payload.date,
        timezone: "Asia/Yerevan",
        available: true,
        reason: null,
        dentist: { id: payload.dentistId },
        service: { id: payload.serviceId },
        slots: [{ start: "09:00", end: "10:00", startAt: "2026-09-10T05:00:00.000Z", endAt: "2026-09-10T06:00:00.000Z", internal: "ignored" }],
      } },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getAvailability({ dentistId: payload.dentistId, serviceId: payload.serviceId, date: payload.date })).resolves.toEqual({
      date: payload.date,
      timezone: "Asia/Yerevan",
      available: true,
      reason: null,
      slots: [{ start: "09:00", end: "10:00", startAt: "2026-09-10T05:00:00.000Z", endAt: "2026-09-10T06:00:00.000Z" }],
    });
    const [url, options] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/api/v1/availability");
    expect(url.searchParams.get("dentistId")).toBe(payload.dentistId);
    expect(options).toMatchObject({ method: "GET", cache: "no-store", credentials: "omit" });
  });

  it("rejects malformed selection and malformed successful responses", async () => {
    await expect(getAvailability({ dentistId: "bad", serviceId: payload.serviceId, date: payload.date })).rejects.toMatchObject({ kind: "configuration" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { availability: { date: payload.date, timezone: "Asia/Yerevan", available: true, reason: null, slots: [{ start: "bad" }] } } }), { status: 200 })));
    await expect(getAvailability({ dentistId: payload.dentistId, serviceId: payload.serviceId, date: payload.date })).rejects.toMatchObject({ kind: "protocol" });
  });

  it("rejects availability returned for a different scheduling selection", async () => {
    const availability = {
      date: payload.date,
      timezone: "Asia/Yerevan",
      available: true,
      reason: null,
      dentist: { id: payload.dentistId },
      service: { id: payload.serviceId },
      slots: [],
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        data: { availability: { ...availability, date: "2026-09-11" } },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        data: { availability: { ...availability, dentist: { id: "64b000000000000000000099" } } },
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getAvailability({
      dentistId: payload.dentistId,
      serviceId: payload.serviceId,
      date: payload.date,
    })).rejects.toMatchObject({ kind: "protocol" });
    await expect(getAvailability({
      dentistId: payload.dentistId,
      serviceId: payload.serviceId,
      date: payload.date,
    })).rejects.toMatchObject({ kind: "protocol" });
  });

  it("excludes challenge tokens from canonical request identity", () => {
    expect(canonicalBookingPayload(payload)).toBe(canonicalBookingPayload({ ...payload, challengeToken: "different-token" }));
    expect(canonicalBookingPayload(payload)).not.toBe(canonicalBookingPayload({ ...payload, startTime: "10:30" }));
    expect(canonicalBookingPayload(payload)).toContain('"patientEmail":"test@example.com"');
  });

  it("creates a lowercase UUID v4", () => {
    expect(createIdempotencyKey()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("posts with the idempotency header and strips internal result identifiers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { appointment } }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const key = "0f459e5d-dbf8-4d92-b512-c329d39a610e";
    const result = await createPublicAppointment(payload, key);
    expect(result).not.toHaveProperty("id");
    expect(result.dentist).toEqual({ firstName: "Ani", lastName: "Test" });
    expect(result.dentist).not.toHaveProperty("id");
    expect(result.service).toEqual({ name: "Cleaning", durationMinutes: 60 });
    expect(result.service).not.toHaveProperty("id");
    expect(result.confirmationCode).toBe(appointment.confirmationCode);
    const [, options] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(options.headers).toMatchObject({ "Idempotency-Key": key, "Content-Type": "application/json" });
    expect(JSON.parse(String(options.body))).toMatchObject({ challengeToken: payload.challengeToken, privacyAccepted: true });
  });

  it("normalizes HTTP errors without exposing backend messages and parses Retry-After", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false, message: "private backend detail", code: "RATE_LIMITED" }), { status: 429, headers: { "retry-after": "45" } })));
    const error = await createPublicAppointment(payload, "0f459e5d-dbf8-4d92-b512-c329d39a610e").catch((value) => value);
    expect(error).toBeInstanceOf(BookingApiError);
    expect(error).toMatchObject({ kind: "http", status: 429, code: "RATE_LIMITED", retryAfterSeconds: 45 });
    expect(error.message).not.toContain("private backend detail");
  });

  it("distinguishes cancellation, timeout, network, and protocol failures", async () => {
    const cancelled = new AbortController();
    cancelled.abort();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError")));
    await expect(getAvailability({ dentistId: payload.dentistId, serviceId: payload.serviceId, date: payload.date, signal: cancelled.signal })).rejects.toMatchObject({ kind: "cancelled" });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    await expect(getAvailability({ dentistId: payload.dentistId, serviceId: payload.serviceId, date: payload.date })).rejects.toMatchObject({ kind: "network" });

    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url: URL, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    })));
    const timeout = expect(getAvailability({ dentistId: payload.dentistId, serviceId: payload.serviceId, date: payload.date })).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(10_001);
    await timeout;
    vi.useRealTimers();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-json", { status: 200 })));
    await expect(getAvailability({ dentistId: payload.dentistId, serviceId: payload.serviceId, date: payload.date })).rejects.toMatchObject({ kind: "protocol" });
  });

  it("rejects malformed nested appointment summaries instead of rendering them", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: { appointment: { ...appointment, dentist: { id: payload.dentistId, firstName: { unsafe: true }, lastName: "Test" } } },
    }), { status: 201 })));
    await expect(createPublicAppointment(payload, "0f459e5d-dbf8-4d92-b512-c329d39a610e")).rejects.toMatchObject({ kind: "protocol" });
  });

  it("rejects a success result for a different patient or occurrence", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        data: { appointment: { ...appointment, patientName: "Another patient" } },
      }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        data: { appointment: { ...appointment, startTime: "10:30" } },
      }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createPublicAppointment(
      payload,
      "0f459e5d-dbf8-4d92-b512-c329d39a610e",
    )).rejects.toMatchObject({ kind: "protocol" });
    await expect(createPublicAppointment(
      payload,
      "0f459e5d-dbf8-4d92-b512-c329d39a610e",
    )).rejects.toMatchObject({ kind: "protocol" });
  });

  it("uses the authoritative localized service summary and annotates Armenian dentist names", async () => {
    const localized = {
      ...appointment,
      dentist: { id: payload.dentistId, firstName: "Անի", lastName: "Փորձարկում" },
      service: {
        ...appointment.service,
        translations: { hy: { name: "Մաքրում" }, ru: { name: "Чистка" } },
      },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { appointment: localized } }), { status: 201 })));
    await expect(createPublicAppointment({ ...payload, locale: "ru" }, "0f459e5d-dbf8-4d92-b512-c329d39a610e")).resolves.toMatchObject({
      dentist: { nameLang: "hy" },
      service: { name: "Чистка", nameLang: "ru" },
    });
  });
});
