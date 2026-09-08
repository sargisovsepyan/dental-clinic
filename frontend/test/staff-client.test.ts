import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StaffApiClient, StaffApiError } from "@/api/staff-client";

const user = { id: "64b000000000000000000091", name: "Preview Admin", email: "admin@preview.local", role: "admin" };
const appointment = {
  _id: "64b000000000000000000071",
  confirmationCode: "DC-STAFF0000000001",
  patientName: "Preview Patient",
  patientPhone: "+37400111111",
  patientEmail: "patient@preview.local",
  dentist: "64b000000000000000000021",
  service: "64b000000000000000000011",
  dentistSnapshot: { firstName: "Ani", lastName: "Preview", title: "Dentist", translations: {} },
  serviceSnapshot: { name: "Cleaning", durationMinutes: 60, translations: {} },
  priceSnapshot: { priceType: "fixed", priceFrom: 20000, priceTo: null, currency: "AMD" },
  date: "2026-09-10", startTime: "09:00", endTime: "10:00",
  startAt: "2026-09-10T05:00:00.000Z", endAt: "2026-09-10T06:00:00.000Z",
  bufferMinutes: 0, mutationVersion: 0, scheduleRevision: 0, notificationLocale: "en",
  rescheduleHistory: [], status: "pending", source: "phone", patientComment: "", internalNote: "",
  privacyConsentAt: "2026-09-01T10:00:00.000Z", privacyConsentMethod: "phone", privacyPolicyVersion: "v1",
  createdAt: "2026-09-01T10:00:00.000Z", updatedAt: "2026-09-01T10:00:00.000Z",
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const successAuth = (token = "access-token-value-long-enough") => json({ success: true, data: { accessToken: token, user } });
const successList = () => json({ success: true, data: { appointments: [appointment], pagination: { page: 1, limit: 25, total: 1, pages: 1 } } });

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:5000/api/v1";
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
  process.env.NEXT_PUBLIC_BOOKING_CHALLENGE_PROVIDER = "disabled";
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("staff API authentication boundary", () => {
  it("keeps tokens in memory and scopes credentials to cookie-auth endpoints", async () => {
    const storageSpy = vi.spyOn(Storage.prototype, "setItem");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(successAuth())
      .mockResolvedValueOnce(successList())
      .mockResolvedValueOnce(json({ success: true }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new StaffApiClient();

    await client.login(user.email, "Preview1!");
    await client.listAppointments({ page: 1, limit: 25 });
    await client.logout();

    expect(storageSpy).not.toHaveBeenCalled();
    const loginOptions = fetchMock.mock.calls[0][1] as RequestInit;
    const listOptions = fetchMock.mock.calls[1][1] as RequestInit;
    const logoutOptions = fetchMock.mock.calls[2][1] as RequestInit;
    expect(loginOptions.credentials).toBe("include");
    expect(loginOptions.headers).not.toHaveProperty("Authorization");
    expect(listOptions.credentials).toBe("omit");
    expect(listOptions.headers).toMatchObject({ Authorization: "Bearer access-token-value-long-enough" });
    expect(logoutOptions.credentials).toBe("include");
    expect(client.hasAccessToken()).toBe(false);
  });

  it("restores a session through refresh and confirms current identity", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(successAuth("fresh-access-token-value"))
      .mockResolvedValueOnce(json({ success: true, data: { user } }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new StaffApiClient();
    await expect(client.bootstrap()).resolves.toEqual(user);
    expect((fetchMock.mock.calls[0][1] as RequestInit).credentials).toBe("include");
    expect((fetchMock.mock.calls[1][1] as RequestInit).headers).toMatchObject({ Authorization: "Bearer fresh-access-token-value" });
  });

  it("coalesces concurrent expired-token requests into one refresh and retries each once", async () => {
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => { releaseRefresh = resolve; });
    let refreshCalls = 0;
    let oldCalls = 0;
    let newCalls = 0;
    const fetchMock = vi.fn(async (input: URL, options: RequestInit) => {
      if (input.pathname.endsWith("/auth/login")) return successAuth("old-access-token-value");
      if (input.pathname.endsWith("/auth/refresh")) {
        refreshCalls += 1;
        await refreshGate;
        return successAuth("new-access-token-value");
      }
      const authorization = (options.headers as Record<string, string>).Authorization;
      if (authorization.endsWith("old-access-token-value")) {
        oldCalls += 1;
        return json({ success: false, message: "expired" }, 401);
      }
      newCalls += 1;
      return successList();
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new StaffApiClient();
    await client.login(user.email, "Preview1!");
    const first = client.listAppointments({ page: 1 });
    const second = client.listAppointments({ page: 1 });
    await vi.waitFor(() => expect(oldCalls).toBe(2));
    releaseRefresh();
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(refreshCalls).toBe(1);
    expect(newCalls).toBe(2);
  });

  it("never refreshes a forbidden response or logs the user out", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(successAuth())
      .mockResolvedValueOnce(json({ success: false, message: "private detail" }, 403, { "x-request-id": "safe-id" }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new StaffApiClient();
    await client.login(user.email, "Preview1!");
    const error = await client.listAppointments({}).catch((value) => value);
    expect(error).toMatchObject({ status: 403, requestId: "safe-id" });
    expect(error.message).not.toContain("private detail");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(client.hasAccessToken()).toBe(true);
  });

  it("stops after an authoritative refresh failure and clears the stale token", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(successAuth())
      .mockResolvedValueOnce(json({ success: false }, 401))
      .mockResolvedValueOnce(json({ success: false }, 401));
    vi.stubGlobal("fetch", fetchMock);
    const client = new StaffApiClient();
    await client.login(user.email, "Preview1!");
    await expect(client.listAppointments({})).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(client.hasAccessToken()).toBe(false);
    await expect(client.listAppointments({})).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry an uncertain refresh outcome", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(successAuth())
      .mockResolvedValueOnce(json({ success: false }, 401))
      .mockRejectedValueOnce(new TypeError("offline"));
    vi.stubGlobal("fetch", fetchMock);
    const client = new StaffApiClient();
    await client.login(user.email, "Preview1!");
    await expect(client.listAppointments({})).rejects.toMatchObject({ kind: "network" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(client.hasAccessToken()).toBe(false);
  });

  it("normalizes mutation conflicts and exposes only safe concurrency metadata", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(successAuth())
      .mockResolvedValueOnce(json({
        success: false,
        message: "patient-private internal message",
        code: "APPOINTMENT_VERSION_CONFLICT",
        details: { currentMutationVersion: 4, patientPhone: "+374-secret" },
      }, 409));
    vi.stubGlobal("fetch", fetchMock);
    const client = new StaffApiClient();
    await client.login(user.email, "Preview1!");
    const error = await client.cancelAppointment(appointment._id, 3, "Requested by patient").catch((value) => value);
    expect(error).toBeInstanceOf(StaffApiError);
    expect(error).toMatchObject({ status: 409, code: "APPOINTMENT_VERSION_CONFLICT", currentMutationVersion: 4 });
    expect(JSON.stringify(error)).not.toContain("+374-secret");
    expect(error.message).not.toContain("patient-private");
    expect(JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))).toEqual({
      expectedMutationVersion: 3,
      reason: "Requested by patient",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps list filters bounded and does not place patient contact data in the URL", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(successAuth()).mockResolvedValueOnce(successList());
    vi.stubGlobal("fetch", fetchMock);
    const client = new StaffApiClient();
    await client.login(user.email, "Preview1!");
    await client.listAppointments({
      page: 2, limit: 25, from: "2026-09-01", to: "2026-09-30",
      status: "confirmed", dentistId: "64b000000000000000000021",
    });
    const [url, options] = fetchMock.mock.calls[1] as [URL, RequestInit];
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("status")).toBe("confirmed");
    expect(url.searchParams.has("phone")).toBe(false);
    expect(options).toMatchObject({ cache: "no-store", credentials: "omit" });
  });

  it("correlates protected reschedule availability with the reviewed selection", async () => {
    const dentistId = "64b000000000000000000021";
    const serviceId = "64b000000000000000000011";
    const availability = {
      date: "2026-09-10", timezone: "Asia/Yerevan", available: true, reason: null,
      dentist: { id: dentistId }, service: { id: serviceId }, rules: {},
      slots: [{ start: "09:00", end: "10:00", startAt: "2026-09-10T05:00:00.000Z", endAt: "2026-09-10T06:00:00.000Z" }],
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(successAuth())
      .mockResolvedValueOnce(json({ success: true, data: { availability } }))
      .mockResolvedValueOnce(json({ success: true, data: { availability: { ...availability, date: "2026-09-11" } } }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new StaffApiClient();
    await client.login(user.email, "Preview1!");
    await expect(client.getRescheduleAvailability({
      id: appointment._id, expectedMutationVersion: 3, dentistId, serviceId, date: "2026-09-10",
    })).resolves.toMatchObject({ date: "2026-09-10", timezone: "Asia/Yerevan" });
    const [url] = fetchMock.mock.calls[1] as [URL, RequestInit];
    expect(url.searchParams.get("expectedMutationVersion")).toBe("3");
    await expect(client.getRescheduleAvailability({
      id: appointment._id, expectedMutationVersion: 3, dentistId, serviceId, date: "2026-09-10",
    })).rejects.toMatchObject({ kind: "protocol" });
  });
});
