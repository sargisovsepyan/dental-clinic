import { afterEach, expect, it, vi } from "vitest";
import { parseFrontendEnvironment, parseApiBaseUrl, parseSiteBaseUrl } from "@/lib/env";
import { getServices } from "@/api/public-client";
import { createPublicAppointment, type BookingPayload } from "@/api/booking-client";
import { readJsonWithSignal } from "@/api/abortable-json";
import {
  FIXED_API_ROUTE_SOURCE,
  buildFixedApiRewrites,
} from "../config/api-rewrite";

const originalEnvironment = { ...process.env };
const production = {
  NEXT_PUBLIC_API_URL: "https://clinic.example.test/api/v1",
  NEXT_PUBLIC_SITE_URL: "https://clinic.example.test",
  NEXT_PUBLIC_BOOKING_CHALLENGE_PROVIDER: "turnstile",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "public-config-only-key",
};

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); process.env = { ...originalEnvironment }; });

it("requires a first-party production browser API and exposes only the public projection", () => {
  expect(parseFrontendEnvironment(production, true).apiBaseUrl).toBe(production.NEXT_PUBLIC_API_URL);
  expect(() => parseFrontendEnvironment({ ...production, NEXT_PUBLIC_API_URL: "https://api.unrelated.test/api/v1" }, true)).toThrow(/share/);
  const result = parseFrontendEnvironment({ ...production, ...{ JWT_SECRET: "private-sensitive-value" } }, true);
  expect(JSON.stringify(result)).not.toContain("private-sensitive-value");
});

it("requires one fixed production upstream while retaining the same-origin browser API", () => {
  const frontend = parseFrontendEnvironment(production, true);
  expect(frontend.apiBaseUrl).toBe(`${frontend.siteBaseUrl}/api/v1`);
  expect(() => buildFixedApiRewrites({
    rawUpstream: undefined,
    production: true,
    siteOrigin: frontend.siteBaseUrl,
  })).toThrow(/API_UPSTREAM_ORIGIN is required/);

  expect(buildFixedApiRewrites({
    rawUpstream: "https://api.example.test",
    production: true,
    siteOrigin: frontend.siteBaseUrl,
  })).toEqual([{
    source: FIXED_API_ROUTE_SOURCE,
    destination: "https://api.example.test/api/v1/:path*",
  }]);
});

it("proxies only the fixed API namespace", () => {
  const rewrites = buildFixedApiRewrites({
    rawUpstream: "https://api.example.test/",
    production: true,
    siteOrigin: "https://clinic.example.test",
  });
  expect(rewrites).toHaveLength(1);
  expect(rewrites[0]?.source).toBe("/api/v1/:path*");
  expect(rewrites[0]?.source).not.toBe("/:path*");
});

it.each([
  "http://api.example.test",
  "https://user:password@api.example.test",
  "https://api.example.test/base",
  "https://api.example.test?target=other",
  "https://api.example.test?",
  "https://api.example.test#fragment",
  "https://api.example.test#",
  "https://localhost",
])("rejects an unsafe fixed API upstream: %s", (rawUpstream) => {
  expect(() => buildFixedApiRewrites({
    rawUpstream,
    production: true,
    siteOrigin: "https://clinic.example.test",
  })).toThrow(/API_UPSTREAM_ORIGIN/);
});

it("rejects a rewrite loop back to the frontend and permits no rewrite when omitted in development", () => {
  expect(() => buildFixedApiRewrites({
    rawUpstream: "https://clinic.example.test",
    production: true,
    siteOrigin: "https://clinic.example.test",
  })).toThrow(/must not point back/);
  expect(buildFixedApiRewrites({
    rawUpstream: undefined,
    production: false,
    siteOrigin: "http://localhost:3000",
  })).toEqual([]);
});

it.each(["localhost", "127.0.0.1", "[::1]", "api.localhost", "0.0.0.0", "[::]", "[::ffff:127.0.0.1]"])("rejects HTTPS production loopback %s", (host) => {
  expect(() => parseApiBaseUrl(`https://${host}/api/v1`, true)).toThrow(/localhost/);
  expect(() => parseSiteBaseUrl(`https://${host}`, true)).toThrow(/localhost/);
});

it("bounds stalled public response bodies without replay", async () => {
  vi.useFakeTimers();
  Object.assign(process.env, { NEXT_PUBLIC_API_URL: "http://localhost:5000/api/v1", NEXT_PUBLIC_SITE_URL: "http://localhost:3000", NEXT_PUBLIC_BOOKING_CHALLENGE_PROVIDER: "disabled" });
  const fetch = vi.fn().mockResolvedValue({ status: 200, ok: true, headers: new Headers(), json: () => new Promise(() => {}) });
  vi.stubGlobal("fetch", fetch);
  const check = expect(getServices()).rejects.toMatchObject({ kind: "timeout" });
  await vi.advanceTimersByTimeAsync(8000);
  await check;
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("bounds indeterminate booking response bodies without mutation replay", async () => {
  vi.useFakeTimers();
  Object.assign(process.env, { NEXT_PUBLIC_API_URL: "http://localhost:5000/api/v1", NEXT_PUBLIC_SITE_URL: "http://localhost:3000", NEXT_PUBLIC_BOOKING_CHALLENGE_PROVIDER: "disabled" });
  const fetch = vi.fn().mockResolvedValue({ status: 201, ok: true, headers: new Headers(), json: () => new Promise(() => {}) });
  vi.stubGlobal("fetch", fetch);
  const payload: BookingPayload = { patientName: "Synthetic", patientPhone: "091123456", dentistId: "64b000000000000000000021", serviceId: "64b000000000000000000011", date: "2026-09-20", startTime: "09:00", locale: "hy", privacyAccepted: true };
  const check = expect(createPublicAppointment(payload, "0f459e5d-dbf8-4d92-b512-c329d39a610e")).rejects.toMatchObject({ kind: "timeout" });
  await vi.advanceTimersByTimeAsync(12000);
  await check;
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("cancels body consumption and removes listeners on completion", async () => {
  const controller = new AbortController();
  const check = expect(readJsonWithSignal({ json: () => new Promise(() => {}) } as Response, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  controller.abort();
  await check;
  await expect(readJsonWithSignal(new Response("{}"), new AbortController().signal)).resolves.toEqual({});
});
