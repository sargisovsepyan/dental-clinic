import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getBeforeAfterCase,
  getBeforeAfterCases,
  getClinic,
  getDentist,
  getDentists,
  getGallery,
  getService,
  getServiceCategories,
  getServices,
  PublicApiError,
} from "@/api/public-client";

const originalEnvironment = { ...process.env };

describe("public API client", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:5000/api/v1";
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    process.env = { ...originalEnvironment };
  });

  it("uses one safe JSON GET boundary without browser credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: { services: [] },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getServices({ featured: true })).resolves.toEqual([]);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit & { next?: unknown }];
    expect(url.toString()).toBe("http://localhost:5000/api/v1/services?featured=true");
    expect(init.method).toBe("GET");
    expect(init.credentials).toBeUndefined();
    expect(init.next).toEqual({ revalidate: 300 });
  });

  it("preserves safe status, code, and request ID without exposing backend text", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: false,
      message: "Database credentials leaked here",
      code: "RATE_LIMITED",
    }), { status: 429, headers: { "x-request-id": "123e4567-e89b-12d3-a456-426614174000" } })));

    await expect(getServiceCategories()).rejects.toMatchObject({
      name: "PublicApiError",
      status: 429,
      code: "RATE_LIMITED",
      requestId: "123e4567-e89b-12d3-a456-426614174000",
      message: "The public API request could not be completed",
    });
  });

  it("normalizes malformed success responses as protocol errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-json", { status: 200 })));
    await expect(getServiceCategories()).rejects.toMatchObject({ kind: "protocol", status: 200 });
  });

  it("normalizes malformed successful envelope fields instead of throwing raw type errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: {},
    }), { status: 200 })));

    await expect(getServices()).rejects.toMatchObject({
      name: "PublicApiError",
      kind: "protocol",
      message: "The public API request could not be completed",
    });
  });

  it("aborts timed-out requests", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url, init: RequestInit | undefined) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    })));
    const assertion = expect(getServices()).rejects.toBeInstanceOf(PublicApiError);
    await vi.advanceTimersByTimeAsync(8_000);
    await assertion;
  });

  it("covers every allowlisted public endpoint wrapper and its identifier guard", async () => {
    const fetchMock = vi.fn((input: URL, _init?: RequestInit & { next?: unknown }) => {
      void _init;
      const path = input.pathname.replace("/api/v1", "");
      let data: object;
      if (path === "/service-categories") data = { categories: [] };
      else if (path === "/services") data = { services: [] };
      else if (path.startsWith("/services/")) data = { service: { slug: "test-cleaning" } };
      else if (path === "/dentists") data = { dentists: [] };
      else if (path.startsWith("/dentists/")) data = { dentist: { slug: "ani-test" } };
      else if (path === "/clinic") data = { clinic: { key: "default" } };
      else if (path === "/media/gallery") data = { images: [] };
      else if (path === "/before-after") data = { cases: [], pagination: { page: 1, limit: 24, total: 0, pages: 0 } };
      else data = { case: { _id: "64b000000000000000000051" } };
      return Promise.resolve(new Response(JSON.stringify({ success: true, data }), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getServiceCategories()).resolves.toEqual([]);
    await expect(getServices()).resolves.toEqual([]);
    await expect(getService("test-cleaning")).resolves.toMatchObject({ slug: "test-cleaning" });
    await expect(getDentists({ service: "test-cleaning" })).resolves.toEqual([]);
    await expect(getDentist("ani-test")).resolves.toMatchObject({ slug: "ani-test" });
    await expect(getClinic()).resolves.toMatchObject({ key: "default" });
    await expect(getGallery()).resolves.toEqual([]);
    await expect(getBeforeAfterCases({ limit: 24 })).resolves.toMatchObject({ cases: [] });
    await expect(getBeforeAfterCase("64b000000000000000000051")).resolves.toMatchObject({
      _id: "64b000000000000000000051",
    });

    const beforeAfterCalls = fetchMock.mock.calls.filter(([url]) =>
      (url as URL).pathname.includes("/before-after"),
    );
    expect(beforeAfterCalls).toHaveLength(2);
    for (const [, init] of beforeAfterCalls) {
      expect(init).toMatchObject({ cache: "no-store" });
      expect(init).not.toHaveProperty("next");
    }

    await expect(getService("Not Canonical")).rejects.toMatchObject({ kind: "http", status: 404 });
    await expect(getDentist("../unsafe")).rejects.toMatchObject({ kind: "http", status: 404 });
    await expect(getBeforeAfterCase("not-an-object-id")).rejects.toMatchObject({ kind: "http", status: 404 });
    expect(fetchMock).toHaveBeenCalledTimes(9);
  });
});
