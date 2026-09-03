import type { components } from "@/api/generated/schema";
import type { Locale } from "@/i18n/locales";
import { getFrontendEnvironment } from "@/lib/env";

type AvailabilityContract = components["schemas"]["Availability"];
type PatientFields = components["schemas"]["PatientBookingFields"];

export type BookingPayload = PatientFields & { challengeToken?: string };
export type AvailabilityReason = AvailabilityContract["reason"];

export interface AvailabilityView {
  date: string;
  timezone: string;
  available: boolean;
  reason: AvailabilityReason;
  slots: Array<{ start: string; end: string; startAt: string; endAt: string }>;
}

export interface BookingResult {
  confirmationCode: string;
  patientName: string;
  date: string;
  startTime: string;
  endTime: string;
  status: "pending" | "confirmed";
  dentist: { firstName: string; lastName: string; nameLang?: Locale };
  service: { name: string; nameLang?: Locale; durationMinutes: number };
  price: {
    priceType: "fixed" | "from" | "range" | "on_request";
    priceFrom?: number | null;
    priceTo?: number | null;
    currency: "AMD";
  };
}

type BookingErrorKind = "timeout" | "network" | "http" | "protocol" | "configuration" | "cancelled";

export class BookingApiError extends Error {
  readonly kind: BookingErrorKind;
  readonly status: number;
  readonly code?: string;
  readonly retryAfterSeconds?: number;

  constructor(options: {
    kind: BookingErrorKind;
    status?: number;
    code?: string;
    retryAfterSeconds?: number;
    cause?: unknown;
  }) {
    super("The booking API request could not be completed", { cause: options.cause });
    this.name = "BookingApiError";
    this.kind = options.kind;
    this.status = options.status ?? 0;
    this.code = options.code;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

const objectId = /^[0-9a-f]{24}$/i;
const localDate = /^\d{4}-\d{2}-\d{2}$/;
const localTime = /^([01]\d|2[0-3]):[0-5]\d$/;
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const confirmationCode = /^DC-[A-F0-9]{16}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const safeCode = (value: unknown) =>
  typeof value === "string" && /^[A-Z0-9_]{1,80}$/.test(value) ? value : undefined;

const primaryTextLanguage = (value: string): Locale | undefined =>
  /\p{Script=Armenian}/u.test(value) ? "hy" : undefined;

function localizedSummaryName(
  baseName: string,
  translations: unknown,
  locale: Locale,
) {
  if (translations === undefined) return { name: baseName, nameLang: primaryTextLanguage(baseName) };
  if (!isRecord(translations)) throw new BookingApiError({ kind: "protocol" });
  for (const candidate of [locale, "hy"] as const) {
    const entry = translations[candidate];
    if (entry === undefined) continue;
    if (!isRecord(entry)) throw new BookingApiError({ kind: "protocol" });
    if (entry.name === undefined) continue;
    if (typeof entry.name !== "string" || entry.name.length < 2) {
      throw new BookingApiError({ kind: "protocol" });
    }
    return { name: entry.name, nameLang: candidate };
  }
  return { name: baseName, nameLang: primaryTextLanguage(baseName) };
}

function apiUrl(path: string) {
  try {
    return new URL(path, `${getFrontendEnvironment().apiBaseUrl}/`);
  } catch (cause) {
    throw new BookingApiError({ kind: "configuration", cause });
  }
}

function parseRetryAfter(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const seconds = Number(value);
  return Number.isSafeInteger(seconds) && seconds >= 0 ? seconds : undefined;
}

async function requestJson(options: {
  path: string;
  method?: "GET" | "POST";
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}) {
  const url = apiUrl(options.path);
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort("timeout"), options.timeoutMs ?? 10_000);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeoutController.signal])
    : timeoutController.signal;
  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      cache: "no-store",
      credentials: "omit",
      signal,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch (cause) {
    if (options.signal?.aborted) throw new BookingApiError({ kind: "cancelled", cause });
    if (timeoutController.signal.aborted) throw new BookingApiError({ kind: "timeout", cause });
    throw new BookingApiError({ kind: "network", cause });
  } finally {
    clearTimeout(timeout);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    throw new BookingApiError({ kind: "protocol", status: response.status, cause });
  }
  if (!response.ok) {
    throw new BookingApiError({
      kind: "http",
      status: response.status,
      code: isRecord(body) ? safeCode(body.code) : undefined,
      retryAfterSeconds: parseRetryAfter(response.headers.get("retry-after")),
    });
  }
  if (!isRecord(body) || body.success !== true || !isRecord(body.data)) {
    throw new BookingApiError({ kind: "protocol", status: response.status });
  }
  return body.data;
}

export async function getAvailability(options: {
  dentistId: string;
  serviceId: string;
  date: string;
  signal?: AbortSignal;
}) {
  if (!objectId.test(options.dentistId) || !objectId.test(options.serviceId) || !localDate.test(options.date)) {
    throw new BookingApiError({ kind: "configuration" });
  }
  const query = new URLSearchParams({
    dentistId: options.dentistId,
    serviceId: options.serviceId,
    date: options.date,
  });
  const data = await requestJson({ path: `availability?${query}`, signal: options.signal });
  const value = data.availability;
  if (
    !isRecord(value) || !localDate.test(String(value.date)) || typeof value.timezone !== "string" ||
    typeof value.available !== "boolean" || !Array.isArray(value.slots)
  ) {
    throw new BookingApiError({ kind: "protocol" });
  }
  const allowedReasons = new Set<unknown>([
    null,
    "SAME_DAY_BOOKING_DISABLED",
    "CLINIC_CLOSED",
    "DENTIST_NOT_WORKING",
    "NO_COMMON_WORKING_TIME",
    "FULLY_BOOKED",
  ]);
  if (!allowedReasons.has(value.reason)) throw new BookingApiError({ kind: "protocol" });
  const slots = value.slots.map((slot) => {
    if (
      !isRecord(slot) || typeof slot.start !== "string" || !localTime.test(slot.start) ||
      typeof slot.end !== "string" || !localTime.test(slot.end) ||
      typeof slot.startAt !== "string" || !Number.isFinite(Date.parse(slot.startAt)) ||
      typeof slot.endAt !== "string" || !Number.isFinite(Date.parse(slot.endAt))
    ) throw new BookingApiError({ kind: "protocol" });
    return { start: slot.start, end: slot.end, startAt: slot.startAt, endAt: slot.endAt };
  });
  return {
    date: value.date,
    timezone: value.timezone,
    available: value.available,
    reason: value.reason,
    slots,
  } as AvailabilityView;
}

export function canonicalBookingPayload(payload: BookingPayload) {
  return JSON.stringify({
    patientName: payload.patientName.trim(),
    patientPhone: payload.patientPhone.trim(),
    patientEmail: (payload.patientEmail || "").trim().toLowerCase(),
    dentistId: payload.dentistId,
    serviceId: payload.serviceId,
    date: payload.date,
    startTime: payload.startTime,
    patientComment: (payload.patientComment || "").trim(),
    locale: payload.locale,
    privacyAccepted: payload.privacyAccepted,
  });
}

export function createIdempotencyKey() {
  const key = globalThis.crypto.randomUUID();
  if (!uuidV4.test(key)) throw new BookingApiError({ kind: "configuration" });
  return key.toLowerCase();
}

export async function createPublicAppointment(
  payload: BookingPayload,
  idempotencyKey: string,
  signal?: AbortSignal,
) {
  if (!uuidV4.test(idempotencyKey)) throw new BookingApiError({ kind: "configuration" });
  const data = await requestJson({
    path: "appointments",
    method: "POST",
    body: payload,
    idempotencyKey,
    signal,
    timeoutMs: 12_000,
  });
  const value = data.appointment;
  const dentist = isRecord(value) && isRecord(value.dentist) ? value.dentist : undefined;
  const service = isRecord(value) && isRecord(value.service) ? value.service : undefined;
  const price = isRecord(value) && isRecord(value.price) ? value.price : undefined;
  const validOptionalPrice = (priceValue: unknown) =>
    priceValue === undefined || priceValue === null ||
    (typeof priceValue === "number" && Number.isFinite(priceValue) && priceValue >= 0);
  if (
    !isRecord(value) || typeof value.confirmationCode !== "string" ||
    !confirmationCode.test(value.confirmationCode) || typeof value.patientName !== "string" ||
    typeof value.date !== "string" || !localDate.test(value.date) ||
    typeof value.startTime !== "string" || !localTime.test(value.startTime) ||
    typeof value.endTime !== "string" || !localTime.test(value.endTime) ||
    (value.status !== "pending" && value.status !== "confirmed") ||
    !dentist || !objectId.test(String(dentist.id)) || typeof dentist.firstName !== "string" ||
    typeof dentist.lastName !== "string" ||
    !service || !objectId.test(String(service.id)) || typeof service.name !== "string" ||
    typeof service.durationMinutes !== "number" || !Number.isInteger(service.durationMinutes) ||
    service.durationMinutes < 1 ||
    !price || !["fixed", "from", "range", "on_request"].includes(String(price.priceType)) ||
    price.currency !== "AMD" || !validOptionalPrice(price.priceFrom) || !validOptionalPrice(price.priceTo)
  ) throw new BookingApiError({ kind: "protocol" });
  if (String(dentist.id) !== payload.dentistId || String(service.id) !== payload.serviceId) {
    throw new BookingApiError({ kind: "protocol" });
  }
  const serviceName = localizedSummaryName(service.name, service.translations, payload.locale);
  const dentistName = `${dentist.firstName} ${dentist.lastName}`.trim();
  return {
    confirmationCode: value.confirmationCode,
    patientName: value.patientName,
    date: value.date,
    startTime: value.startTime,
    endTime: value.endTime,
    status: value.status,
    dentist: {
      firstName: dentist.firstName,
      lastName: dentist.lastName,
      ...(primaryTextLanguage(dentistName) ? { nameLang: "hy" as const } : {}),
    },
    service: {
      name: serviceName.name,
      ...(serviceName.nameLang ? { nameLang: serviceName.nameLang } : {}),
      durationMinutes: service.durationMinutes,
    },
    price: {
      priceType: price.priceType as BookingResult["price"]["priceType"],
      ...(price.priceFrom !== undefined ? { priceFrom: price.priceFrom as number | null } : {}),
      ...(price.priceTo !== undefined ? { priceTo: price.priceTo as number | null } : {}),
      currency: "AMD",
    },
  } satisfies BookingResult;
}
