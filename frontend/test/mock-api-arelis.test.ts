import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createMockApiServer, previewAccounts, previewPassword } from "./e2e/mock-api.mjs";

let server: Server;
let baseUrl: string;
let currentTime = new Date("2026-09-20T08:00:00.000Z");

async function json(path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, init);
  return { response, body: await response.json() };
}

async function adminToken() {
  const { response, body } = await json("/api/v1/auth/login", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: previewAccounts.admin.email, password: previewPassword }),
  });
  expect(response.status).toBe(200);
  return body.data.accessToken as string;
}

const body = (value: unknown, token?: string): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(value),
});

beforeAll(async () => {
  server = createMockApiServer(5129, "success", { profile: "arelis", now: () => currentTime });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(async () => {
  currentTime = new Date("2026-09-20T08:00:00.000Z");
  await fetch(`${baseUrl}/__test__/scenario/success`);
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("clean Arelis mock API contract", () => {
  it("mirrors the shared contact boundary for direct public, account, and invitation requests", async () => {
    const malformedEmail = "person@-example.com";
    expect((await json("/api/v1/auth/login", body({ email: malformedEmail, password: previewPassword }))).response.status).toBe(400);
    expect((await json("/api/v1/auth/forgot-password", body({ email: malformedEmail }))).response.status).toBe(400);

    const token = await adminToken();
    expect((await json("/api/v1/staff/invite", body({ name: "Valid Staff", email: malformedEmail, role: "dentist" }, token))).response.status).toBe(400);

    const services = (await json("/api/v1/services")).body.data.services;
    const service = services[0];
    const dentist = (await json(`/api/v1/dentists?bookingEnabled=true&service=${service._id}`)).body.data.dentists[0];
    const booking = {
      patientName: "Մարիամ Հակոբյան", patientPhone: "+374 99 123456", patientEmail: "", patientComment: "",
      dentistId: dentist._id, serviceId: service._id, date: "2026-09-22", startTime: "09:00",
      privacyAccepted: true, locale: "en",
    };
    expect((await json("/api/v1/appointments", {
      ...body({ ...booking, patientPhone: "+374((((99----000001" }),
      headers: { "content-type": "application/json", "idempotency-key": "invalid-phone-structure" },
    })).response.status).toBe(400);
    expect((await json("/api/v1/appointments", {
      ...body({ ...booking, patientEmail: malformedEmail }),
      headers: { "content-type": "application/json", "idempotency-key": "invalid-email-structure" },
    })).response.status).toBe(400);
    expect((await json("/api/v1/appointments", {
      ...body({ ...booking, patientPhone: "+099000001" }),
      headers: { "content-type": "application/json", "idempotency-key": "invalid-explicit-local-phone" },
    })).response.status).toBe(400);

    const explicitInternational = await json("/api/v1/appointments", {
      ...body({ ...booking, patientPhone: "+12345678", patientEmail: "person@example.invalid" }),
      headers: { "content-type": "application/json", "idempotency-key": "explicit-international-phone" },
    });
    expect(explicitInternational.response.status).toBe(201);
    expect(explicitInternational.body.data.appointment).toMatchObject({ status: "pending" });
    expect(explicitInternational.body.data.appointment).not.toHaveProperty("patientPhone");
    expect(explicitInternational.body.data.appointment).not.toHaveProperty("patientEmail");
    const listing = await json("/api/v1/appointments?page=1&limit=100", {
      headers: { authorization: `Bearer ${token}` },
    });
    const stored = listing.body.data.appointments.find(
      (item: Record<string, unknown>) => item._id === explicitInternational.body.data.appointment.id,
    );
    expect(stored).toMatchObject({ patientPhone: "+12345678", status: "pending" });
  });

  it("rejects direct past, impossible, and beyond-horizon booking payloads and keeps public/admin statuses authoritative", async () => {
    const services = (await json("/api/v1/services")).body.data.services;
    const service = services[0];
    const dentists = (await json(`/api/v1/dentists?bookingEnabled=true&service=${service._id}`)).body.data.dentists;
    const dentist = dentists[0];
    const valid = {
      patientName: "Մարիամ Հակոբյան", patientPhone: "(099) 123-456", patientEmail: "", patientComment: "Call after 10:00.",
      dentistId: dentist._id, serviceId: service._id, date: "2026-09-22", startTime: "09:00",
      privacyAccepted: true, locale: "en",
    };
    for (const [index, date] of ["2026-09-19", "2026-02-29", "2026-11-20"].entries()) {
      const { response } = await json("/api/v1/appointments", {
        ...body({ ...valid, date }), headers: { "content-type": "application/json", "idempotency-key": `invalid-date-${index}` },
      });
      expect(response.status, date).toBe(400);
    }
    const publicCreated = await json("/api/v1/appointments", {
      ...body(valid), headers: { "content-type": "application/json", "idempotency-key": "public-pending" },
    });
    expect(publicCreated.response.status).toBe(201);
    expect(publicCreated.body.data.appointment.status).toBe("pending");

    currentTime = new Date("2026-09-20T09:00:00.000Z");
    const token = await adminToken();
    const staffCreated = await json("/api/v1/appointments/admin", body({
      ...valid, startTime: "14:30", source: "phone", consentMethod: "phone", internalNote: "",
    }, token));
    expect(staffCreated.response.status).toBe(201);
    expect(staffCreated.body.data.appointment).toMatchObject({ status: "confirmed", createdAt: currentTime.toISOString() });

    const listing = await json("/api/v1/appointments?page=1&limit=25", { headers: { authorization: `Bearer ${token}` } });
    const storedPublic = listing.body.data.appointments.find((item: Record<string, unknown>) => item._id === publicCreated.body.data.appointment.id);
    expect(storedPublic).toMatchObject({ status: "pending", createdAt: "2026-09-20T08:00:00.000Z" });
  });

  it("uses the injected mutation clock for governance, scheduling, and media records", async () => {
    const token = await adminToken();
    const dentist = (await json("/api/v1/dentists/admin/all", { headers: { authorization: `Bearer ${token}` } })).body.data.dentists[0];
    currentTime = new Date("2026-09-20T10:00:00.000Z");
    const invited = await json("/api/v1/staff/invite", body({ name: "Анна-Мария Иванова", email: "anna@example.test", role: "dentist", dentistProfileId: dentist._id }, token));
    expect(invited.response.status).toBe(201);
    expect(invited.body.data.staff).toMatchObject({ createdAt: currentTime.toISOString(), updatedAt: currentTime.toISOString() });

    currentTime = new Date("2026-09-20T11:00:00.000Z");
    const cancelled = await json(`/api/v1/staff/${invited.body.data.staff._id}/cancel-invitation`, body({}, token));
    expect(cancelled.response.status).toBe(200);
    expect(cancelled.body.data.staff).toMatchObject({ deactivatedAt: currentTime.toISOString(), updatedAt: currentTime.toISOString() });

    currentTime = new Date("2026-09-20T12:00:00.000Z");
    const exception = await json(`/api/v1/dentists/${dentist._id}/schedule-exceptions/2026-09-23`, {
      method: "PUT", headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ isWorking: false, shifts: [], note: "Training", expectedScheduleRevision: dentist.scheduleRevision }),
    });
    expect(exception.body.data.exception).toMatchObject({ createdAt: currentTime.toISOString(), updatedAt: currentTime.toISOString() });

    currentTime = new Date("2026-09-20T13:00:00.000Z");
    const boundary = "arelis-focused-test-boundary";
    const translations = JSON.stringify({ hy: { altText: "Սենյակ", caption: "" }, ru: { altText: "Кабинет", caption: "" }, en: { altText: "Room", caption: "" } });
    const part = (name: string, value: string) => `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
    const multipart = `${part("translations", translations)}${part("sortOrder", "0")}${part("isActive", "true")}--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="room.png"\r\nContent-Type: image/png\r\n\r\nabc\r\n--${boundary}--\r\n`;
    const media = await json("/api/v1/media/gallery", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": `multipart/form-data; boundary=${boundary}` }, body: multipart });
    expect(media.response.status).toBe(201);
    expect(media.body.data.image).toMatchObject({ type: "clinic_gallery", createdAt: currentTime.toISOString(), updatedAt: currentTime.toISOString() });
  });

  it("removes a hidden dentist from public reads and stale booking paths until deliberately re-enabled", async () => {
    const token = await adminToken();
    const services = (await json("/api/v1/services")).body.data.services;
    const service = services[0];
    const dentist = (await json(`/api/v1/dentists?bookingEnabled=true&service=${service._id}`)).body.data.dentists[0];
    expect((await json(`/api/v1/dentists/${dentist.slug}`)).response.status).toBe(200);

    expect((await json(`/api/v1/dentists/${dentist._id}`, { method: "DELETE", headers: { authorization: `Bearer ${token}` } })).response.status).toBe(200);
    expect((await json(`/api/v1/dentists/${dentist.slug}`)).response.status).toBe(404);
    expect((await json(`/api/v1/dentists?bookingEnabled=true&service=${service._id}`)).body.data.dentists.some((item: Record<string, unknown>) => item._id === dentist._id)).toBe(false);
    expect((await json(`/api/v1/availability?date=2026-09-22&dentistId=${dentist._id}&serviceId=${service._id}`)).response.status).toBe(400);
    const stale = await json("/api/v1/appointments", {
      ...body({ patientName: "Davit Petrosyan", patientPhone: "+37499123456", patientEmail: "", patientComment: "", dentistId: dentist._id, serviceId: service._id, date: "2026-09-22", startTime: "09:00", privacyAccepted: true, locale: "en" }),
      headers: { "content-type": "application/json", "idempotency-key": "stale-hidden-dentist" },
    });
    expect(stale.response.status).toBe(400);

    expect((await json(`/api/v1/dentists/${dentist._id}/restore`, { method: "PATCH", headers: { authorization: `Bearer ${token}` } })).response.status).toBe(200);
    expect((await json(`/api/v1/dentists/${dentist.slug}`)).response.status).toBe(200);
    expect((await json(`/api/v1/dentists?bookingEnabled=true&service=${service._id}`)).body.data.dentists.some((item: Record<string, unknown>) => item._id === dentist._id)).toBe(false);
    expect((await json(`/api/v1/dentists/${dentist._id}`, { method: "PATCH", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ bookingEnabled: true }) })).response.status).toBe(200);
    expect((await json(`/api/v1/dentists?bookingEnabled=true&service=${service._id}`)).body.data.dentists.some((item: Record<string, unknown>) => item._id === dentist._id)).toBe(true);
  });
});
