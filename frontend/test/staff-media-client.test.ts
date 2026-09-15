import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StaffApiClient } from "@/api/staff-client";
import {
  MAX_MEDIA_FILE_BYTES,
  beforeAfterUploadForm,
  validateMediaFile,
} from "@/api/staff-media";

const timestamp = "2026-09-10T10:00:00.000Z";
const user = { id: "64b000000000000000000091", name: "Admin", email: "admin@example.test", role: "admin" };
const image = (name: string) => ({
  publicId: `dental-clinic/${name}`,
  secureUrl: `https://res.cloudinary.com/clinic-cloud/image/upload/dental-clinic/${name}.png`,
  width: 640,
  height: 480,
  format: "png",
  bytes: 1_024,
});
const gallery = {
  _id: "64b000000000000000000041",
  type: "clinic_gallery",
  image: image("gallery"),
  altText: "Reception",
  caption: "Welcome area",
  translations: { hy: { altText: "Ընդունարան" }, en: { altText: "Reception" } },
  sortOrder: 2,
  isActive: true,
  createdAt: timestamp,
  updatedAt: timestamp,
  createdBy: { email: "must-not-be-copied@example.test" },
};
const governedCase = {
  _id: "64b000000000000000000051",
  title: "Result",
  description: "",
  translations: { hy: { title: "Արդյունք" }, en: { title: "Result" } },
  service: { _id: "64b000000000000000000011", name: "Cleaning", slug: "cleaning", translations: {} },
  dentist: { _id: "64b000000000000000000021", firstName: "Ani", lastName: "Test", slug: "ani-test", title: "", translations: {}, photo: null },
  beforeImage: image("before"),
  afterImage: image("after"),
  publicationStatus: "published",
  consentStatus: "active",
  consentPolicyVersion: "2026-01",
  consentMethod: "external",
  consentConfirmedAt: timestamp,
  consentRecordedBy: user.id,
  externalConsentReference: "CONSENT:2026/opaque-42",
  withdrawnAt: null,
  withdrawnBy: null,
  withdrawalReason: "",
  purgedAt: null,
  purgedBy: null,
  consentHistory: [{ action: "confirmed", actor: user.id }],
  isFeatured: false,
  isActive: true,
  sortOrder: 0,
  createdAt: timestamp,
  updatedAt: timestamp,
  createdBy: { email: user.email },
};
const cleanupJob = {
  _id: "64b000000000000000000061",
  publicId: "private/provider/id",
  reason: "consent_purge",
  sourceType: "before_after",
  sourceId: governedCase._id,
  status: "failed",
  attempts: 2,
  maxAttempts: 5,
  nextAttemptAt: timestamp,
  lockedAt: null,
  lockedBy: "private-worker",
  lastErrorCode: "provider_unavailable",
  completedAt: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const auth = (token = "access-token-value-long-enough") =>
  json({ success: true, data: { accessToken: token, user } });
const pngFile = () => new File([new Uint8Array([137, 80, 78, 71])], "clinic.png", { type: "image/png" });

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://localhost:5000/api/v1";
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
  process.env.NEXT_PUBLIC_BOOKING_CHALLENGE_PROVIDER = "disabled";
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("staff governed media client", () => {
  it("sends bounded authenticated multipart without manually setting its content type", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(auth())
      .mockResolvedValueOnce(json({ success: true, data: { image: gallery } }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new StaffApiClient();
    await client.login(user.email, "Preview1!");

    const result = await client.createGalleryImage({
      image: pngFile(),
      translations: { hy: { altText: "Ընդունարան" } },
      sortOrder: 2,
      active: true,
    });

    const [url, options] = fetchMock.mock.calls[1] as [URL, RequestInit];
    expect(url.pathname).toBe("/api/v1/media/gallery");
    expect(options).toMatchObject({ method: "POST", cache: "no-store", credentials: "omit" });
    expect(options.headers).toMatchObject({ Authorization: "Bearer access-token-value-long-enough" });
    expect(options.headers).not.toHaveProperty("Content-Type");
    expect(options.body).toBeInstanceOf(FormData);
    expect((options.body as FormData).get("image")).toBeInstanceOf(File);
    expect((options.body as FormData).get("translations")).toBe(JSON.stringify({ hy: { altText: "Ընդունարան" } }));
    expect(result).not.toHaveProperty("createdBy");
  });

  it("replays an upload only after an explicit pre-mutation 401 and refreshes once", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(auth("expired-access-token"))
      .mockResolvedValueOnce(json({ success: false, code: "TOKEN_EXPIRED" }, 401))
      .mockResolvedValueOnce(auth("fresh-access-token"))
      .mockResolvedValueOnce(json({ success: true, data: { image: gallery } }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new StaffApiClient();
    await client.login(user.email, "Preview1!");
    await expect(client.createGalleryImage({
      image: pngFile(), translations: { hy: { altText: "Ընդունարան" } }, sortOrder: 0, active: true,
    })).resolves.toMatchObject({ id: gallery._id });

    const paths = fetchMock.mock.calls.map(([url]) => (url as URL).pathname);
    expect(paths).toEqual([
      "/api/v1/auth/login",
      "/api/v1/media/gallery",
      "/api/v1/auth/refresh",
      "/api/v1/media/gallery",
    ]);
    expect((fetchMock.mock.calls[3][1] as RequestInit).headers)
      .toMatchObject({ Authorization: "Bearer fresh-access-token" });
  });

  it("never retries a network-uncertain upload and keeps the session available for authority refetch", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(auth())
      .mockRejectedValueOnce(new TypeError("connection lost after upload"));
    vi.stubGlobal("fetch", fetchMock);
    const client = new StaffApiClient();
    await client.login(user.email, "Preview1!");
    await expect(client.createGalleryImage({
      image: pngFile(), translations: { hy: { altText: "Ընդունարան" } }, sortOrder: 0, active: true,
    })).rejects.toMatchObject({ kind: "network", status: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(client.hasAccessToken()).toBe(true);
  });

  it("bounds upload timeout and honors caller cancellation", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(auth())
      .mockImplementationOnce((_url: URL, options: RequestInit) => new Promise((_resolve, reject) => {
        options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      }))
      .mockImplementationOnce((_url: URL, options: RequestInit) => new Promise((_resolve, reject) => {
        options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new StaffApiClient();
    await client.login(user.email, "Preview1!");

    const timedOut = client.replaceDentistPhoto("64b000000000000000000021", pngFile());
    const timedOutExpectation = expect(timedOut).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(45_000);
    await timedOutExpectation;

    const controller = new AbortController();
    const cancelled = client.replaceServiceImage("64b000000000000000000011", pngFile(), controller.signal);
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ kind: "cancelled" });
  });

  it("allowlists governance and cleanup data while retaining required consent state", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(auth())
      .mockResolvedValueOnce(json({ success: true, data: {
        cases: [governedCase], pagination: { page: 1, limit: 24, total: 1, pages: 1 },
      } }))
      .mockResolvedValueOnce(json({ success: true, data: {
        jobs: [cleanupJob], pagination: { page: 3, limit: 50, total: 101, pages: 3 },
      } }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new StaffApiClient();
    await client.login(user.email, "Preview1!");
    const cases = await client.listBeforeAfterCases();
    const jobs = await client.listMediaCleanupJobs({ page: 3, status: "failed" });

    expect(cases.cases[0]).toMatchObject({
      publicationStatus: "published", consentStatus: "active", externalConsentReference: "CONSENT:2026/opaque-42",
    });
    expect(cases.cases[0]).not.toHaveProperty("consentHistory");
    expect(cases.cases[0]).not.toHaveProperty("createdBy");
    expect(jobs.jobs[0]).not.toHaveProperty("publicId");
    expect(jobs.jobs[0]).not.toHaveProperty("lockedBy");
    const cleanupUrl = fetchMock.mock.calls[2][0] as URL;
    expect(cleanupUrl.searchParams.get("page")).toBe("3");
    expect(cleanupUrl.searchParams.get("status")).toBe("failed");
    expect(jobs.pagination).toMatchObject({ page: 3, pages: 3 });
  });

  it("constructs exact governed pair fields without inventing server consent evidence", () => {
    const form = beforeAfterUploadForm({
      beforeImage: new File(["before"], "before.webp", { type: "image/webp" }),
      afterImage: new File(["after"], "after.webp", { type: "image/webp" }),
      translations: { hy: { title: "Արդյունք" }, en: { title: "Result" } },
      consentMethod: "external",
      externalConsentReference: "CONSENT:2026/opaque-42",
      active: true,
      featured: false,
      sortOrder: 3,
    });
    expect(form.get("beforeImage")).toBeInstanceOf(File);
    expect(form.get("afterImage")).toBeInstanceOf(File);
    expect(form.get("consentConfirmed")).toBe("true");
    expect(form.get("consentMethod")).toBe("external");
    expect(form.get("externalConsentReference")).toBe("CONSENT:2026/opaque-42");
    expect(form.has("consentPolicyVersion")).toBe(false);
    expect(form.has("consentConfirmedAt")).toBe(false);
    expect(form.has("consentRecordedBy")).toBe(false);
  });

  it("maps before/after edit state to the backend's exact isFeatured field", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(auth())
      .mockResolvedValueOnce(json({ success: true, data: { case: { ...governedCase, isFeatured: true } } }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new StaffApiClient();
    await client.login(user.email, "Preview1!");

    await client.updateBeforeAfterCase(governedCase._id, {
      translations: { hy: { title: "Արդյունք" } },
      serviceId: governedCase.service._id,
      dentistId: governedCase.dentist._id,
      featured: true,
      sortOrder: 4,
    });

    const options = fetchMock.mock.calls[1][1] as RequestInit;
    expect(JSON.parse(String(options.body))).toEqual({
      translations: { hy: { title: "Արդյունք" } },
      serviceId: governedCase.service._id,
      dentistId: governedCase.dentist._id,
      isFeatured: true,
      sortOrder: 4,
    });
  });

  it("omits unchanged optional before/after relations from the PATCH body", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(auth())
      .mockResolvedValueOnce(json({ success: true, data: { case: governedCase } }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new StaffApiClient();
    await client.login(user.email, "Preview1!");

    await client.updateBeforeAfterCase(governedCase._id, {
      translations: { hy: { title: "Փոփոխված արդյունք" } },
      featured: false,
      sortOrder: 0,
    });

    expect(JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))).toEqual({
      translations: { hy: { title: "Փոփոխված արդյունք" } },
      isFeatured: false,
      sortOrder: 0,
    });
  });

  it("exercises the governed lifecycle endpoints with their exact methods and bounded response shapes", async () => {
    const dentistId = governedCase.dentist._id;
    const serviceId = governedCase.service._id;
    const mutation = { _id: governedCase._id, publicationStatus: "withdrawn", consentStatus: "withdrawn" };
    const fetchMock = vi.fn(async (input: URL, options: RequestInit = {}) => {
      const path = input.pathname;
      const method = options.method || "GET";
      if (path.endsWith("/auth/login")) return auth();
      if (path.endsWith("/media/gallery/admin")) return json({ success: true, data: { images: [gallery] } });
      if (path.endsWith(`/media/gallery/${gallery._id}/restore`)) return json({ success: true, data: { image: gallery } });
      if (path.endsWith(`/media/gallery/${gallery._id}`) && method === "PATCH") return json({ success: true, data: { image: gallery } });
      if (path.endsWith(`/media/gallery/${gallery._id}`) && method === "DELETE") return json({ success: true });
      if (path.endsWith(`/media/dentists/${dentistId}/photo`)) {
        return json({ success: true, data: { dentist: { _id: dentistId, photo: method === "PUT" ? image("dentist") : null } } });
      }
      if (path.endsWith(`/media/services/${serviceId}/image`)) {
        return json({ success: true, data: { service: { _id: serviceId, image: method === "PUT" ? image("service") : null } } });
      }
      if (path.endsWith(`/media/cleanup-jobs/${cleanupJob._id}/retry`)) return json({ success: true, data: { job: cleanupJob } });
      if (path.endsWith("/before-after") && method === "POST") return json({ success: true, data: { case: governedCase } });
      if (path.endsWith(`/before-after/${governedCase._id}`) && method === "DELETE") return json({ success: true });
      if (path.endsWith(`/before-after/${governedCase._id}/restore`)) return json({ success: true, data: { case: mutation } });
      if (path.endsWith(`/before-after/${governedCase._id}/before-image`) || path.endsWith(`/before-after/${governedCase._id}/after-image`)) {
        return json({ success: true, data: { case: mutation } });
      }
      if (path.endsWith(`/before-after/${governedCase._id}/consent/withdraw`)) return json({ success: true, data: { case: mutation } });
      if (path.endsWith(`/before-after/${governedCase._id}/purge`)) {
        return json({ success: true, data: { case: { ...mutation, publicationStatus: "purged", consentStatus: "purged" } } });
      }
      throw new Error(`Unexpected request: ${method} ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new StaffApiClient();
    await client.login(user.email, "Preview1!");

    await expect(client.listGallery()).resolves.toHaveLength(1);
    await expect(client.updateGalleryImage(gallery._id, { translations: {}, sortOrder: 4 })).resolves.toMatchObject({ id: gallery._id });
    await client.disableGalleryImage(gallery._id);
    await expect(client.restoreGalleryImage(gallery._id)).resolves.toMatchObject({ id: gallery._id });
    await expect(client.replaceDentistPhoto(dentistId, pngFile())).resolves.toMatchObject({ secureUrl: expect.any(String) });
    await expect(client.removeDentistPhoto(dentistId)).resolves.toBeNull();
    await expect(client.replaceServiceImage(serviceId, pngFile())).resolves.toMatchObject({ secureUrl: expect.any(String) });
    await expect(client.removeServiceImage(serviceId)).resolves.toBeNull();
    await expect(client.retryMediaCleanupJob(cleanupJob._id)).resolves.toMatchObject({ id: cleanupJob._id });
    await expect(client.createBeforeAfterCase({
      beforeImage: pngFile(), afterImage: pngFile(), translations: { hy: { title: "Արդյունք" } },
      serviceId, dentistId, consentMethod: "written", active: false, featured: false, sortOrder: 1,
    })).resolves.toMatchObject({ id: governedCase._id });
    await client.disableBeforeAfterCase(governedCase._id);
    await expect(client.restoreBeforeAfterCase(governedCase._id)).resolves.toMatchObject({ publicationStatus: "withdrawn" });
    await expect(client.replaceBeforeAfterImage(governedCase._id, "before", pngFile())).resolves.toMatchObject({ consentStatus: "withdrawn" });
    await expect(client.replaceBeforeAfterImage(governedCase._id, "after", pngFile())).resolves.toMatchObject({ consentStatus: "withdrawn" });
    await expect(client.withdrawBeforeAfterConsent(governedCase._id, "Consent withdrawn")).resolves.toMatchObject({ consentStatus: "withdrawn" });
    await expect(client.purgeBeforeAfterCase(governedCase._id, "Retention period ended")).resolves.toMatchObject({ consentStatus: "purged" });

    const calls = fetchMock.mock.calls.slice(1).map(([url, options]) => [
      (options as RequestInit).method || "GET",
      (url as URL).pathname,
    ]);
    expect(calls).toContainEqual(["PUT", `/api/v1/media/dentists/${dentistId}/photo`]);
    expect(calls).toContainEqual(["DELETE", `/api/v1/media/services/${serviceId}/image`]);
    expect(calls).toContainEqual(["POST", `/api/v1/before-after/${governedCase._id}/consent/withdraw`]);
    const purgeOptions = fetchMock.mock.calls.find(([url]) => (url as URL).pathname.endsWith("/purge"))?.[1] as RequestInit;
    expect(JSON.parse(String(purgeOptions.body))).toEqual({
      confirmation: "PERMANENTLY PURGE BEFORE AFTER MEDIA",
      reason: "Retention period ended",
    });
  });

  it("rejects malformed governed-media identifiers before any network request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const client = new StaffApiClient();
    const invalidId = "not-an-object-id";

    await expect(client.updateGalleryImage(invalidId, { translations: {}, sortOrder: 0 })).rejects.toMatchObject({ kind: "configuration" });
    await expect(client.disableGalleryImage(invalidId)).rejects.toMatchObject({ kind: "configuration" });
    await expect(client.restoreGalleryImage(invalidId)).rejects.toMatchObject({ kind: "configuration" });
    await expect(client.replaceDentistPhoto(invalidId, pngFile())).rejects.toMatchObject({ kind: "configuration" });
    await expect(client.removeServiceImage(invalidId)).rejects.toMatchObject({ kind: "configuration" });
    await expect(client.retryMediaCleanupJob(invalidId)).rejects.toMatchObject({ kind: "configuration" });
    await expect(client.disableBeforeAfterCase(invalidId)).rejects.toMatchObject({ kind: "configuration" });
    await expect(client.restoreBeforeAfterCase(invalidId)).rejects.toMatchObject({ kind: "configuration" });
    await expect(client.replaceBeforeAfterImage(invalidId, "before", pngFile())).rejects.toMatchObject({ kind: "configuration" });
    await expect(client.withdrawBeforeAfterConsent(invalidId, "reason")).rejects.toMatchObject({ kind: "configuration" });
    await expect(client.purgeBeforeAfterCase(invalidId, "reason")).rejects.toMatchObject({ kind: "configuration" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("mirrors the backend file envelope as UX validation only", () => {
    for (const [extension, type] of [
      ["jpg", "image/jpeg"], ["jpeg", "image/jpeg"], ["png", "image/png"],
      ["webp", "image/webp"], ["heic", "image/heic"], ["heif", "image/heif"],
    ]) {
      expect(validateMediaFile(new File(["image"], `image.${extension}`, { type }))).toBeNull();
    }
    expect(validateMediaFile(new File([], "empty.png", { type: "image/png" }))).toBe("empty");
    expect(validateMediaFile(new File([new Uint8Array(MAX_MEDIA_FILE_BYTES + 1)], "large.png", { type: "image/png" })))
      .toBe("too-large");
    expect(validateMediaFile(new File(["text"], "note.txt", { type: "text/plain" }))).toBe("unsupported");
    expect(validateMediaFile(new File(["image"], "image.avif", { type: "image/avif" }))).toBe("unsupported");
    expect(validateMediaFile(new File(["fake"], "fake.jpg", { type: "image/png" }))).toBe("unsupported");
  });
});
