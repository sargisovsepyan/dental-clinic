import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StaffApiClient } from "@/api/staff-client";

const timestamp = "2026-01-01T00:00:00.000Z";
const user = { id: "64b000000000000000000091", name: "Admin", email: "admin@example.test", role: "admin" };
const category = { _id: "64b000000000000000000001", name: "Բուժում", slug: "treatment", description: "", translations: { hy: { name: "Բուժում" } }, imageUrl: "", sortOrder: 0, isActive: true, createdAt: timestamp, updatedAt: timestamp };
const service = { _id: "64b000000000000000000011", name: "Մաքրում", slug: "cleaning", category, shortDescription: "", description: "", translations: { hy: { name: "Մաքրում" } }, priceType: "from", priceFrom: 20_000, priceTo: null, currency: "AMD", durationMinutes: 60, imageUrl: "", image: null, isFeatured: false, bookingEnabled: true, isActive: true, sortOrder: 0, createdAt: timestamp, updatedAt: timestamp };
const dentist = { _id: "64b000000000000000000021", firstName: "Ani", lastName: "Preview", slug: "ani-preview", title: "", specializations: [], bio: "", translations: { hy: { title: "Ատամնաբույժ" } }, experienceYears: 1, photoUrl: "", photo: null, languages: ["hy"], services: [{ _id: service._id, name: service.name, slug: service.slug, translations: service.translations, isActive: true, bookingEnabled: true }], weeklySchedule: [], scheduleRevision: 0, isFeatured: false, bookingEnabled: false, isActive: true, sortOrder: 0, createdAt: timestamp, updatedAt: timestamp };
const clinic = { _id: "64b000000000000000000031", key: "default", clinicName: "Կլինիկա", tagline: "", description: "", phone: "", secondaryPhone: "", email: "", address: "", translations: { hy: { clinicName: "Կլինիկա" } }, mapUrl: "", latitude: null, longitude: null, timezone: "Asia/Yerevan", socialLinks: { instagram: "", facebook: "", whatsapp: "", telegram: "" }, weeklySchedule: [], bookingSettings: { isBookingEnabled: true, slotIntervalMinutes: 30, minBookingNoticeMinutes: 120, maxBookingDaysAhead: 60, bufferMinutes: 0, allowSameDayBooking: true, requireEmail: false, autoConfirmAppointments: false, maxAppointmentsPerPhonePerDay: 3 }, scheduleRevision: 0, createdAt: timestamp, updatedAt: timestamp };
const exception = { _id: "64b000000000000000000041", dentist: dentist._id, date: "2026-09-20", isWorking: false, shifts: [], note: "Leave", createdAt: timestamp, updatedAt: timestamp };
const closure = { _id: "64b000000000000000000051", date: "2026-09-21", isOpen: false, shifts: [], note: "Holiday", createdAt: timestamp, updatedAt: timestamp };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const auth = () => json({ success: true, data: { accessToken: "access-token-value-long-enough", user } });

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:5000/api/v1";
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
  process.env.NEXT_PUBLIC_BOOKING_CHALLENGE_PROVIDER = "disabled";
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("staff management API client", () => {
  it("strictly parses the authoritative admin lists and clinic response", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(auth())
      .mockResolvedValueOnce(json({ success: true, data: { categories: [{ ...category, serviceMutationVersion: 99 }] } }))
      .mockResolvedValueOnce(json({ success: true, data: { services: [{ ...service, bookingGuardVersion: 99 }] } }))
      .mockResolvedValueOnce(json({ success: true, data: { dentists: [dentist] } }))
      .mockResolvedValueOnce(json({ success: true, data: { clinic } }))
      .mockResolvedValueOnce(json({ success: true, data: { exceptions: [exception] } }))
      .mockResolvedValueOnce(json({ success: true, data: { closures: [closure] } }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new StaffApiClient();
    await client.login(user.email, "Preview1!");

    const [categories, services, dentists, parsedClinic, exceptions, closures] = await Promise.all([
      client.listCategories(), client.listServices(), client.listDentists(), client.getClinic(),
      client.listScheduleExceptions(dentist._id, "2026-09-01", "2026-09-30"),
      client.listClinicClosures("2026-09-01", "2026-09-30"),
    ]);
    expect(categories[0]).not.toHaveProperty("serviceMutationVersion");
    expect(services[0]).not.toHaveProperty("bookingGuardVersion");
    expect(dentists[0]).toMatchObject({ _id: dentist._id, scheduleRevision: 0 });
    expect(parsedClinic).toMatchObject({ timezone: "Asia/Yerevan" });
    expect(exceptions[0]).toEqual(exception);
    expect(closures[0]).toEqual(closure);
    for (const [, options] of fetchMock.mock.calls.slice(1) as Array<[URL, RequestInit]>) {
      expect(options).toMatchObject({ cache: "no-store", credentials: "omit" });
    }
  });

  it("uses PUT/DELETE with reviewed schedule revisions and query-encodes acknowledgements", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(auth())
      .mockImplementation(() => Promise.resolve(json({ success: true })));
    vi.stubGlobal("fetch", fetchMock);
    const client = new StaffApiClient();
    await client.login(user.email, "Preview1!");
    await client.setScheduleException(dentist._id, "2026-09-20", {
      expectedScheduleRevision: 3, isWorking: false, shifts: [], note: "Leave",
    });
    await client.deleteScheduleException(dentist._id, "2026-09-20", 4, "a".repeat(64));
    await client.setClinicClosure("2026-09-21", {
      expectedScheduleRevision: 7, isOpen: false, shifts: [], note: "Holiday",
    });
    await client.deleteClinicClosure("2026-09-21", 8, "b".repeat(64));

    const calls = fetchMock.mock.calls.slice(1) as Array<[URL, RequestInit]>;
    expect(calls.map(([, options]) => options.method)).toEqual(["PUT", "DELETE", "PUT", "DELETE"]);
    expect(calls[0][0].pathname).toBe(`/api/v1/dentists/${dentist._id}/schedule-exceptions/2026-09-20`);
    expect(JSON.parse(String(calls[0][1].body))).toMatchObject({ expectedScheduleRevision: 3, isWorking: false });
    expect(calls[1][0].searchParams.get("expectedScheduleRevision")).toBe("4");
    expect(calls[1][0].searchParams.get("scheduleConflictAcknowledgement")).toBe("a".repeat(64));
    expect(calls[3][0].searchParams.get("scheduleConflictAcknowledgement")).toBe("b".repeat(64));
  });

  it("sends explicit archive and restore mutations for each managed catalog type", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(auth())
      .mockImplementation(() => Promise.resolve(json({ success: true })));
    vi.stubGlobal("fetch", fetchMock);
    const client = new StaffApiClient();
    await client.login(user.email, "Preview1!");

    await client.disableCategory(category._id);
    await client.restoreCategory(category._id);
    await client.disableService(service._id);
    await client.restoreService(service._id);
    await client.disableDentist(dentist._id);
    await client.restoreDentist(dentist._id);

    const calls = fetchMock.mock.calls.slice(1) as Array<[URL, RequestInit]>;
    expect(calls.map(([url, options]) => [url.pathname, options.method])).toEqual([
      [`/api/v1/service-categories/${category._id}`, "DELETE"],
      [`/api/v1/service-categories/${category._id}/restore`, "PATCH"],
      [`/api/v1/services/${service._id}`, "DELETE"],
      [`/api/v1/services/${service._id}/restore`, "PATCH"],
      [`/api/v1/dentists/${dentist._id}`, "DELETE"],
      [`/api/v1/dentists/${dentist._id}/restore`, "PATCH"],
    ]);
  });

  it("fails malformed admin projections closed instead of retaining unknown response data", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(auth())
      .mockResolvedValueOnce(json({ success: true, data: { categories: [{ ...category, isActive: "yes" }] } }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new StaffApiClient();
    await client.login(user.email, "Preview1!");
    await expect(client.listCategories()).rejects.toMatchObject({ kind: "protocol" });
  });
});
