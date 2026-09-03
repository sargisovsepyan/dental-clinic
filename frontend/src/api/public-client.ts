import type { components } from "@/api/generated/schema";
import { getFrontendEnvironment } from "@/lib/env";
import { isCanonicalSlug, isObjectId } from "@/i18n/locales";

export type ServiceCategoryRecord = components["schemas"]["ServiceCategoryPublic"];
export type ServiceRecord = components["schemas"]["ServicePublic"];
export type DentistRecord = components["schemas"]["DentistPublic"];
export type ClinicRecord = components["schemas"]["ClinicPublic"];
export type GalleryImageRecord = components["schemas"]["GalleryImagePublic"];
export type BeforeAfterRecord = components["schemas"]["BeforeAfterCasePublic"];
export type Pagination = components["schemas"]["Pagination"];

type ErrorKind = "configuration" | "timeout" | "network" | "http" | "protocol";

export class PublicApiError extends Error {
  readonly kind: ErrorKind;
  readonly status: number;
  readonly code?: string;
  readonly requestId?: string;

  constructor(options: {
    kind: ErrorKind;
    status?: number;
    code?: string;
    requestId?: string;
    cause?: unknown;
  }) {
    super("The public API request could not be completed", { cause: options.cause });
    this.name = "PublicApiError";
    this.kind = options.kind;
    this.status = options.status ?? 0;
    this.code = options.code;
    this.requestId = options.requestId;
  }
}

interface GetOptions {
  query?: Record<string, string | number | boolean | undefined>;
  revalidate?: number;
  cache?: RequestCache;
  signal?: AbortSignal;
  timeoutMs?: number;
}

const safeRequestId = (value: string | null) =>
  value && /^[a-zA-Z0-9-]{1,128}$/.test(value) ? value : undefined;

const safeCode = (value: unknown) =>
  typeof value === "string" && /^[A-Z0-9_]{1,80}$/.test(value) ? value : undefined;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

function protocolError(): never {
  throw new PublicApiError({ kind: "protocol" });
}

function requiredArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : protocolError();
}

function requiredRecord<T>(value: unknown): T {
  return isRecord(value) ? value as T : protocolError();
}

function requiredPagination(value: unknown): Pagination {
  const pagination = requiredRecord<Record<string, unknown>>(value);
  const valid =
    typeof pagination.page === "number" && Number.isInteger(pagination.page) && pagination.page >= 1 &&
    typeof pagination.limit === "number" && Number.isInteger(pagination.limit) && pagination.limit >= 1 &&
    typeof pagination.total === "number" && Number.isInteger(pagination.total) && pagination.total >= 0 &&
    typeof pagination.pages === "number" && Number.isInteger(pagination.pages) && pagination.pages >= 0;
  return valid ? pagination as unknown as Pagination : protocolError();
}

function buildApiUrl(path: string, query: GetOptions["query"]) {
  if (!path.startsWith("/") || path.startsWith("//") || /[\\?#]/.test(path) || path.includes("..")) {
    throw new PublicApiError({ kind: "configuration" });
  }

  let base: string;
  try {
    base = getFrontendEnvironment().apiBaseUrl;
  } catch (cause) {
    throw new PublicApiError({ kind: "configuration", cause });
  }

  const url = new URL(`${base}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url;
}

async function publicGet<T>(path: string, options: GetOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), options.timeoutMs ?? 8_000);
  const signal = options.signal
    ? AbortSignal.any([controller.signal, options.signal])
    : controller.signal;

  let response: Response;
  try {
    response = await fetch(buildApiUrl(path, options.query), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal,
      ...(options.cache
        ? { cache: options.cache }
        : { next: { revalidate: options.revalidate ?? 300 } }),
    });
  } catch (cause) {
    const timedOut = controller.signal.aborted && !options.signal?.aborted;
    throw new PublicApiError({ kind: timedOut ? "timeout" : "network", cause });
  } finally {
    clearTimeout(timeout);
  }

  const requestId = safeRequestId(response.headers.get("x-request-id"));
  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    throw new PublicApiError({ kind: "protocol", status: response.status, requestId, cause });
  }

  if (!response.ok) {
    const code = body && typeof body === "object" ? safeCode((body as { code?: unknown }).code) : undefined;
    throw new PublicApiError({ kind: "http", status: response.status, code, requestId });
  }

  if (
    !isRecord(body) ||
    body.success !== true ||
    !isRecord(body.data)
  ) {
    throw new PublicApiError({ kind: "protocol", status: response.status, requestId });
  }

  return body as T;
}

export async function getServiceCategories() {
  const result = await publicGet<components["schemas"]["ServiceCategoryListEnvelope"]>(
    "/service-categories",
    { revalidate: 300 },
  );
  return requiredArray<ServiceCategoryRecord>(result.data.categories);
}

export async function getServices(query: {
  category?: string;
  featured?: boolean;
  bookingEnabled?: boolean;
} = {}) {
  const result = await publicGet<components["schemas"]["ServiceListEnvelope"]>("/services", {
    query,
    revalidate: 300,
  });
  return requiredArray<ServiceRecord>(result.data.services);
}

export async function getService(slug: string) {
  if (!isCanonicalSlug(slug)) throw new PublicApiError({ kind: "http", status: 404 });
  const result = await publicGet<components["schemas"]["ServiceDetailEnvelope"]>(
    `/services/${encodeURIComponent(slug)}`,
    { revalidate: 300 },
  );
  return requiredRecord<ServiceRecord>(result.data.service);
}

export async function getDentists(query: {
  service?: string;
  featured?: boolean;
  bookingEnabled?: boolean;
} = {}) {
  const result = await publicGet<components["schemas"]["DentistListEnvelope"]>("/dentists", {
    query,
    revalidate: 300,
  });
  return requiredArray<DentistRecord>(result.data.dentists);
}

export async function getDentist(slug: string) {
  if (!isCanonicalSlug(slug)) throw new PublicApiError({ kind: "http", status: 404 });
  const result = await publicGet<components["schemas"]["DentistDetailEnvelope"]>(
    `/dentists/${encodeURIComponent(slug)}`,
    { revalidate: 300 },
  );
  return requiredRecord<DentistRecord>(result.data.dentist);
}

export async function getClinic() {
  const result = await publicGet<components["schemas"]["ClinicPublicEnvelope"]>("/clinic", {
    revalidate: 300,
  });
  return requiredRecord<ClinicRecord>(result.data.clinic);
}

export async function getGallery() {
  const result = await publicGet<components["schemas"]["GalleryPublicEnvelope"]>("/media/gallery", {
    revalidate: 300,
  });
  return requiredArray<GalleryImageRecord>(result.data.images);
}

export async function getBeforeAfterCases(query: {
  page?: number;
  limit?: number;
  serviceId?: string;
  dentistId?: string;
  featured?: boolean;
} = {}) {
  const result = await publicGet<components["schemas"]["BeforeAfterListEnvelope"]>(
    "/before-after",
    { query, cache: "no-store" },
  );
  return {
    cases: requiredArray<BeforeAfterRecord>(result.data.cases),
    pagination: requiredPagination(result.data.pagination),
  };
}

export async function getBeforeAfterCase(id: string) {
  if (!isObjectId(id)) throw new PublicApiError({ kind: "http", status: 404 });
  const result = await publicGet<components["schemas"]["BeforeAfterDetailEnvelope"]>(
    `/before-after/${id}`,
    { cache: "no-store" },
  );
  return requiredRecord<BeforeAfterRecord>(result.data.case);
}
