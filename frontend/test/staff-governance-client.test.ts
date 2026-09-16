import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StaffApiClient } from "@/api/staff-client";
import { parseGovernedStaff, parseAuditMetadata, parseGovernedAudit, parseGovernancePagination, parseStaffPage, utcFilterInstant } from "@/api/staff-governance";

const time = "2026-09-15T08:00:00.000Z";
const user = { id: "64b000000000000000000091", name: "Admin", email: "admin@example.test", role: "admin" };
const member = { _id: user.id, name: user.name, email: user.email, role: user.role, isActive: true, isSetupComplete: true, deactivatedAt: null, createdAt: time, updatedAt: time };
const log = { _id: "64b000000000000000000001", requestId: "request-safe", actor: { _id: user.id, name: user.name, email: user.email, role: user.role }, action: "future.unknown", entityType: "future-entity", entityId: "reference", method: "GET", path: "/safe", metadata: { nested: { values: [true, 2, null], reason: "<b>plain text</b>" } }, createdAt: time };
const pagination = { page: 1, limit: 10, total: 1, pages: 1 };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(status < 400 ? { success: true, data } : { success: false, message: "private server error" }), { status });
beforeEach(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:5000/api/v1";
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
  process.env.NEXT_PUBLIC_BOOKING_CHALLENGE_PROVIDER = "disabled";
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("positive governance projections", () => {
  it("drops all unlisted staff, actor, and audit fields", () => {
    expect(parseGovernedStaff({ ...member, password: "secret", authVersion: 5, inviteToken: "secret" })).toEqual({ id: user.id, name: user.name, email: user.email, role: "admin", isActive: true, isSetupComplete: true, deactivatedAt: null, createdAt: time, updatedAt: time });
    const safe = parseGovernedAudit({ ...log, ip: "private", userAgent: "private", actor: { ...log.actor, password: "secret" } });
    expect(safe).not.toHaveProperty("ip"); expect(safe.actor).not.toHaveProperty("password");
    expect(parseGovernedAudit({ ...log, actor: null }).actor).toBeNull();
  });
  it("rejects malformed identities, lifecycle, dates, actors, and pagination", () => {
    for (const field of [{ _id: "bad" }, { role: "owner" }, { name: "x".repeat(101) }, { email: 8 }, { isActive: "true" }, { isSetupComplete: null }, { deactivatedAt: "bad" }, { createdAt: "2026-02-31T00:00:00.000Z" }]) expect(() => parseGovernedStaff({ ...member, ...field })).toThrow();
    for (const actor of ["bad", {}, { ...log.actor, role: "owner" }]) expect(() => parseGovernedAudit({ ...log, actor })).toThrow();
    for (const value of [{ ...pagination, page: 2 }, { ...pagination, limit: 101 }, { ...pagination, total: -1 }, { ...pagination, pages: 9 }, { ...pagination, total: Infinity }]) expect(() => parseGovernancePagination(value, pagination)).toThrow();
    expect(() => parseStaffPage({ staff: [member, member], pagination: { ...pagination, total: 2 } }, pagination)).toThrow();
    expect(() => parseStaffPage({ staff: Array(11).fill(member), pagination }, pagination)).toThrow();
    expect(() => parseStaffPage(null, pagination)).toThrow();
    expect(() => parseGovernedAudit({ ...log, method: "EXEC" })).toThrow();
    expect(() => parseGovernedAudit({ ...log, path: "/safe?token=private" })).toThrow();
  });
  it("bounds nested metadata and rejects suspicious keys/types without rendering them", () => {
    expect(parseAuditMetadata(log.metadata)).toEqual(log.metadata);
    for (const key of ["patientName", "Authorization", "internalNotes", "rawRequestBody", "access_token", "cookie", "$operator", "bad.path", "constructor"]) expect(() => parseAuditMetadata({ nested: { [key]: "private" } })).toThrow();
    for (const value of [undefined, Infinity, "x".repeat(501), Array(21).fill(1), { a: { b: { c: { d: { e: 1 } } } } }, Object.fromEntries(Array.from({ length: 51 }, (_, index) => [`k${index}`, true]))]) expect(() => parseAuditMetadata(value)).toThrow();
    // Every individual depth/array/object bound is valid, but the total render
    // budget must still reject this broad metadata tree.
    expect(() => parseAuditMetadata({ a: Array.from({ length: 20 }, () => ({ b: Array(20).fill(true), c: Array(20).fill(true), d: Array(20).fill(true) })) })).toThrow();
    expect(utcFilterInstant("2026-09-15T10:30")).toBe("2026-09-15T10:30:00.000Z");
    expect(utcFilterInstant("")).toBeUndefined();
    expect(() => utcFilterInstant("2026-02-31T10:30")).toThrow();
    expect(() => utcFilterInstant("bad")).toThrow();
  });
});

describe("governed staff client", () => {
  async function client(fetchMock: ReturnType<typeof vi.fn>) {
    vi.stubGlobal("fetch", fetchMock);
    const api = new StaffApiClient(); await api.login(user.email, "Preview123!"); return api;
  }
  const auth = () => json({ accessToken: "preview-access-long-enough", user });
  it("sends exact invitation/role bodies and server-side staff/audit queries without persisting tokens", async () => {
    const storage = vi.spyOn(Storage.prototype, "setItem");
    const mock = vi.fn().mockResolvedValueOnce(auth()).mockResolvedValueOnce(json({ staff: [member], pagination })).mockResolvedValueOnce(json({ staff: member, token: "must-drop" }, 201)).mockResolvedValueOnce(json({ staff: member })).mockResolvedValueOnce(json({ staff: member })).mockResolvedValueOnce(json({ logs: [log], pagination }));
    const api = await client(mock);
    await api.listStaff({ ...pagination, isActive: false, setupComplete: false, role: "dentist" });
    const invited = await api.inviteStaff({ name: "Staff", email: "staff@example.test", role: "dentist", token: "must-not-send" } as never);
    await api.getStaff(user.id);
    await api.mutateStaff(user.id, "role", "receptionist");
    await api.listAuditLogs({ page: 1, limit: 10, action: "staff.invited", actorId: user.id, from: time, to: time, entityType: "user", entityId: user.id });
    expect(JSON.parse(mock.mock.calls[2][1].body)).toEqual({ name: "Staff", email: "staff@example.test", role: "dentist" });
    expect(JSON.parse(mock.mock.calls[4][1].body)).toEqual({ role: "receptionist" });
    expect(new URL(mock.mock.calls[1][0]).searchParams.get("isActive")).toBe("false");
    expect(new URL(mock.mock.calls[5][0]).searchParams.get("from")).toBe(time);
    expect(invited).not.toHaveProperty("token"); expect(storage).not.toHaveBeenCalled();
    for (const [, options] of mock.mock.calls.slice(1)) { expect(options.cache).toBe("no-store"); expect(options.credentials).toBe("omit"); }
  });
  it("never replays an uncertain invitation or lifecycle write, and preserves sessions on 403/409", async () => {
    const mock = vi.fn().mockResolvedValueOnce(auth()).mockRejectedValueOnce(new TypeError("offline")).mockResolvedValueOnce(json({}, 503)).mockResolvedValueOnce(json({}, 403)).mockResolvedValueOnce(json({}, 409));
    const api = await client(mock);
    const payload = { name: "Staff", email: "staff@example.test", role: "dentist" as const };
    await expect(api.inviteStaff(payload)).rejects.toMatchObject({ kind: "network" });
    await expect(api.inviteStaff(payload)).rejects.toMatchObject({ status: 503 });
    await expect(api.mutateStaff(user.id, "deactivate")).rejects.toMatchObject({ status: 403 });
    await expect(api.mutateStaff(user.id, "reactivate")).rejects.toMatchObject({ status: 409 });
    expect(api.hasAccessToken()).toBe(true); expect(mock).toHaveBeenCalledTimes(5);
  });
  it("normalizes malformed responses and refuses a returned target mismatch", async () => {
    const mock = vi.fn().mockResolvedValueOnce(auth()).mockResolvedValueOnce(json({ staff: { ...member, _id: "64b000000000000000000092" } })).mockResolvedValueOnce(json({ staff: member, pagination: {} })).mockResolvedValueOnce(json({ logs: [{ ...log, metadata: { patientPhone: "private" } }], pagination }));
    const api = await client(mock);
    await expect(api.mutateStaff(user.id, "revoke-sessions")).rejects.toMatchObject({ kind: "protocol" });
    await expect(api.listStaff({ page: 1, limit: 10 })).rejects.toMatchObject({ kind: "protocol" });
    await expect(api.listAuditLogs({ page: 1, limit: 10 })).rejects.toMatchObject({ kind: "protocol" });
    await expect(api.getStaff("bad")).rejects.toMatchObject({ kind: "configuration" });
    await expect(api.mutateStaff(user.id, "role", "owner" as never)).rejects.toMatchObject({ kind: "configuration" });
  });
  it("keeps the invitation timeout active through response-body delivery without replay", async () => {
    vi.useFakeTimers();
    const mock = vi.fn().mockResolvedValueOnce(auth()).mockImplementationOnce((_url, options) => Promise.resolve({
      ok: true, status: 201, headers: new Headers(),
      json: () => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("body stalled")), { once: true })),
    }));
    const api = await client(mock);
    const outcome = api.inviteStaff({ name: "Staff", email: "staff@example.test", role: "dentist" }).catch((error) => error);
    await vi.advanceTimersByTimeAsync(10_001);
    expect(await outcome).toMatchObject({ kind: "timeout", status: 201 });
    expect(mock).toHaveBeenCalledTimes(2);
  });
  it("does not refresh/replay a malformed 401 invitation response body", async () => {
    const mock = vi.fn().mockResolvedValueOnce(auth()).mockResolvedValueOnce(new Response("not-json", { status: 401 }));
    const api = await client(mock);
    await expect(api.inviteStaff({ name: "Staff", email: "staff@example.test", role: "dentist" })).rejects.toMatchObject({ kind: "protocol", status: 401 });
    expect(mock).toHaveBeenCalledTimes(2);
  });
});
