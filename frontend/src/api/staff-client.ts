import type { components } from "@/api/generated/schema";
import { getFrontendEnvironment } from "@/lib/env";

export type StaffRole = components["schemas"]["Role"];
export type StaffUser = components["schemas"]["CurrentStaffUser"];
export type StaffAppointment = components["schemas"]["AppointmentAdmin"];
export type StaffAppointmentStatus = components["schemas"]["AppointmentStatus"];
export type AdminBookingPayload = components["schemas"]["AdminBookingRequest"];
export type ReschedulePayload = components["schemas"]["RescheduleRequest"];
export type Availability = components["schemas"]["Availability"];
export type Pagination = components["schemas"]["Pagination"];

type ErrorKind = "timeout" | "network" | "http" | "protocol" | "configuration" | "cancelled";

export class StaffApiError extends Error {
  readonly kind: ErrorKind;
  readonly status: number;
  readonly code?: string;
  readonly requestId?: string;
  readonly retryAfterSeconds?: number;
  readonly currentMutationVersion?: number;

  constructor(options: {
    kind: ErrorKind;
    status?: number;
    code?: string;
    requestId?: string;
    retryAfterSeconds?: number;
    currentMutationVersion?: number;
    cause?: unknown;
  }) {
    super("The staff API request could not be completed", { cause: options.cause });
    this.name = "StaffApiError";
    this.kind = options.kind;
    this.status = options.status ?? 0;
    this.code = options.code;
    this.requestId = options.requestId;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.currentMutationVersion = options.currentMutationVersion;
  }
}

type RequestOptions = {
  path: string;
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
  signal?: AbortSignal;
  credentials?: RequestCredentials;
  authorization?: string;
  timeoutMs?: number;
};

const roles = new Set<unknown>(["admin", "receptionist", "dentist"]);
const statuses = new Set<unknown>([
  "pending", "confirmed", "checked_in", "in_progress", "completed", "cancelled", "no_show",
]);
const objectId = /^[0-9a-f]{24}$/i;
const safeHeader = /^[A-Za-z0-9._:-]{1,128}$/;
const safeCode = /^[A-Z0-9_]{1,80}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

function apiUrl(path: string) {
  if (!/^[a-z0-9][a-z0-9/?=&._-]*$/i.test(path) || path.includes("..")) {
    throw new StaffApiError({ kind: "configuration" });
  }
  try {
    return new URL(path, `${getFrontendEnvironment().apiBaseUrl}/`);
  } catch (cause) {
    throw new StaffApiError({ kind: "configuration", cause });
  }
}

function parsePositiveInteger(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

async function rawRequest(options: RequestOptions) {
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort("timeout"), options.timeoutMs ?? 10_000);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeoutController.signal])
    : timeoutController.signal;
  let response: Response;
  try {
    response = await fetch(apiUrl(options.path), {
      method: options.method ?? "GET",
      cache: "no-store",
      credentials: options.credentials ?? "omit",
      signal,
      headers: {
        Accept: "application/json",
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(options.authorization ? { Authorization: `Bearer ${options.authorization}` } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch (cause) {
    if (options.signal?.aborted) throw new StaffApiError({ kind: "cancelled", cause });
    if (timeoutController.signal.aborted) throw new StaffApiError({ kind: "timeout", cause });
    throw new StaffApiError({ kind: "network", cause });
  } finally {
    clearTimeout(timeout);
  }

  const requestIdValue = response.headers.get("x-request-id");
  const requestId = requestIdValue && safeHeader.test(requestIdValue) ? requestIdValue : undefined;
  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    throw new StaffApiError({ kind: "protocol", status: response.status, requestId, cause });
  }
  if (!response.ok) {
    const codeValue = isRecord(body) ? body.code : undefined;
    const details = isRecord(body) && isRecord(body.details) ? body.details : undefined;
    const currentMutationVersion = details?.currentMutationVersion;
    throw new StaffApiError({
      kind: "http",
      status: response.status,
      requestId,
      code: typeof codeValue === "string" && safeCode.test(codeValue) ? codeValue : undefined,
      retryAfterSeconds: parsePositiveInteger(response.headers.get("retry-after")),
      currentMutationVersion: Number.isInteger(currentMutationVersion)
        ? currentMutationVersion as number
        : undefined,
    });
  }
  if (!isRecord(body) || body.success !== true) {
    throw new StaffApiError({ kind: "protocol", status: response.status, requestId });
  }
  return body;
}

function parseUser(value: unknown): StaffUser {
  if (
    !isRecord(value) || !objectId.test(String(value.id)) || typeof value.name !== "string" ||
    typeof value.email !== "string" || !roles.has(value.role)
  ) throw new StaffApiError({ kind: "protocol" });
  return { id: String(value.id), name: value.name, email: value.email, role: value.role as StaffRole };
}

function parseAuth(value: unknown) {
  if (!isRecord(value) || !isRecord(value.data) || typeof value.data.accessToken !== "string" ||
      value.data.accessToken.length < 16) {
    throw new StaffApiError({ kind: "protocol" });
  }
  return { accessToken: value.data.accessToken, user: parseUser(value.data.user) };
}

function parseAppointment(value: unknown): StaffAppointment {
  if (
    !isRecord(value) || !objectId.test(String(value._id)) || typeof value.confirmationCode !== "string" ||
    typeof value.patientName !== "string" || typeof value.patientPhone !== "string" ||
    typeof value.patientEmail !== "string" || typeof value.date !== "string" ||
    typeof value.startTime !== "string" || typeof value.endTime !== "string" ||
    !statuses.has(value.status) || !Number.isInteger(value.mutationVersion) ||
    !Number.isInteger(value.scheduleRevision) || !isRecord(value.dentistSnapshot) ||
    !isRecord(value.serviceSnapshot) || !isRecord(value.priceSnapshot) ||
    typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt)) ||
    typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))
  ) throw new StaffApiError({ kind: "protocol" });
  return value as unknown as StaffAppointment;
}

function dataRecord(body: unknown) {
  if (!isRecord(body) || !isRecord(body.data)) throw new StaffApiError({ kind: "protocol" });
  return body.data;
}

function parseAppointmentResponse(body: unknown) {
  return parseAppointment(dataRecord(body).appointment);
}

function parseAvailability(body: unknown, expected: { date: string; dentistId: string; serviceId: string }) {
  const value = dataRecord(body).availability;
  if (!isRecord(value) || value.date !== expected.date || typeof value.timezone !== "string" ||
      !isRecord(value.dentist) || String(value.dentist.id) !== expected.dentistId ||
      !isRecord(value.service) || String(value.service.id) !== expected.serviceId ||
      typeof value.available !== "boolean" || !Array.isArray(value.slots)) {
    throw new StaffApiError({ kind: "protocol" });
  }
  for (const slot of value.slots) {
    if (!isRecord(slot) || typeof slot.start !== "string" || typeof slot.end !== "string" ||
        typeof slot.startAt !== "string" || typeof slot.endAt !== "string") {
      throw new StaffApiError({ kind: "protocol" });
    }
  }
  return value as unknown as Availability;
}

let sameTabRefresh: Promise<{ accessToken: string; user: StaffUser }> | null = null;
const sessionLockName = "dental-clinic-staff-refresh";

async function withSessionLock<T>(operation: () => Promise<T>) {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request(sessionLockName, { mode: "exclusive" }, operation);
  }
  return operation();
}

async function coordinatedRefresh() {
  if (sameTabRefresh) return sameTabRefresh;
  sameTabRefresh = withSessionLock(async () => parseAuth(await rawRequest({
      path: "auth/refresh", method: "POST", credentials: "include", timeoutMs: 10_000,
  })));
  try {
    return await sameTabRefresh;
  } finally {
    sameTabRefresh = null;
  }
}

export class StaffApiClient {
  #accessToken: string | null = null;
  #sessionEpoch = 0;

  hasAccessToken() {
    return this.#accessToken !== null;
  }

  clearSession() {
    this.#accessToken = null;
    this.#sessionEpoch += 1;
  }

  async login(email: string, password: string) {
    const sessionEpoch = ++this.#sessionEpoch;
    this.#accessToken = null;
    const result = parseAuth(await rawRequest({
      path: "auth/login", method: "POST", credentials: "include", body: { email, password },
    }));
    if (sessionEpoch !== this.#sessionEpoch) {
      throw new StaffApiError({ kind: "cancelled", status: 401 });
    }
    this.#accessToken = result.accessToken;
    return result.user;
  }

  async bootstrap() {
    const sessionEpoch = this.#sessionEpoch;
    const refreshed = await coordinatedRefresh();
    if (sessionEpoch !== this.#sessionEpoch) {
      throw new StaffApiError({ kind: "cancelled", status: 401 });
    }
    this.#accessToken = refreshed.accessToken;
    try {
      const body = await rawRequest({ path: "auth/me", authorization: this.#accessToken });
      return parseUser(dataRecord(body).user);
    } catch (error) {
      this.clearSession();
      throw error;
    }
  }

  async logout() {
    const locksAvailable = typeof navigator !== "undefined" && Boolean(navigator.locks);
    const pendingRefresh = sameTabRefresh;
    this.clearSession();
    try {
      if (!locksAvailable && pendingRefresh) await pendingRefresh.catch(() => undefined);
      await withSessionLock(() => rawRequest({
        path: "auth/logout", method: "POST", credentials: "include",
      }));
    } finally {
      this.#accessToken = null;
    }
  }

  async forgotPassword(email: string) {
    await rawRequest({ path: "auth/forgot-password", method: "POST", body: { email } });
  }

  async resetPassword(token: string, password: string) {
    await rawRequest({ path: "auth/reset-password", method: "POST", body: { token, password } });
  }

  async setupPassword(token: string, password: string) {
    await rawRequest({ path: "auth/setup-password", method: "POST", body: { token, password } });
  }

  async #protected(options: Omit<RequestOptions, "authorization" | "credentials">, allowRefresh = true) {
    if (!this.#accessToken) throw new StaffApiError({ kind: "http", status: 401 });
    const sessionEpoch = this.#sessionEpoch;
    try {
      const body = await rawRequest({ ...options, authorization: this.#accessToken, credentials: "omit" });
      if (sessionEpoch !== this.#sessionEpoch) throw new StaffApiError({ kind: "cancelled", status: 401 });
      return body;
    } catch (error) {
      if (!(error instanceof StaffApiError) || error.status !== 401 || !allowRefresh) throw error;
      if (sessionEpoch !== this.#sessionEpoch) throw new StaffApiError({ kind: "cancelled", status: 401 });
      try {
        const refreshed = await coordinatedRefresh();
        if (sessionEpoch !== this.#sessionEpoch) throw new StaffApiError({ kind: "cancelled", status: 401 });
        this.#accessToken = refreshed.accessToken;
      } catch (refreshError) {
        this.clearSession();
        throw refreshError;
      }
      try {
        const body = await rawRequest({ ...options, authorization: this.#accessToken, credentials: "omit" });
        if (sessionEpoch !== this.#sessionEpoch) throw new StaffApiError({ kind: "cancelled", status: 401 });
        return body;
      } catch (retryError) {
        if (retryError instanceof StaffApiError && retryError.status === 401) this.clearSession();
        throw retryError;
      }
    }
  }

  async changePassword(currentPassword: string, newPassword: string) {
    try {
      await this.#protected({
        path: "auth/change-password", method: "POST", body: { currentPassword, newPassword },
      });
      this.clearSession();
    } catch (error) {
      if (error instanceof StaffApiError &&
          (error.status === 401 || error.kind === "network" || error.kind === "timeout")) {
        this.clearSession();
      }
      throw error;
    }
  }

  async listAppointments(filters: {
    page?: number; limit?: number; date?: string; from?: string; to?: string;
    dentistId?: string; serviceId?: string; status?: StaffAppointmentStatus;
  }, signal?: AbortSignal) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== "") query.set(key, String(value));
    }
    const body = await this.#protected({ path: `appointments?${query}`, signal });
    const data = dataRecord(body);
    if (!Array.isArray(data.appointments) || !isRecord(data.pagination)) {
      throw new StaffApiError({ kind: "protocol" });
    }
    const pagination = data.pagination;
    if (![pagination.page, pagination.limit, pagination.total, pagination.pages].every(Number.isInteger)) {
      throw new StaffApiError({ kind: "protocol" });
    }
    return {
      appointments: data.appointments.map(parseAppointment),
      pagination: pagination as unknown as Pagination,
    };
  }

  async getAppointment(id: string, signal?: AbortSignal) {
    if (!objectId.test(id)) throw new StaffApiError({ kind: "configuration" });
    return parseAppointmentResponse(await this.#protected({ path: `appointments/${id}`, signal }));
  }

  async createAppointment(payload: AdminBookingPayload) {
    return parseAppointmentResponse(await this.#protected({
      path: "appointments/admin", method: "POST", body: payload, timeoutMs: 12_000,
    }));
  }

  async getAvailability(options: {
    dentistId: string; serviceId: string; date: string; signal?: AbortSignal;
  }) {
    const query = new URLSearchParams({
      dentistId: options.dentistId, serviceId: options.serviceId, date: options.date,
    });
    return parseAvailability(await rawRequest({ path: `availability?${query}`, signal: options.signal }), options);
  }

  async getRescheduleAvailability(options: {
    id: string; expectedMutationVersion: number; dentistId: string; serviceId: string;
    date: string; signal?: AbortSignal;
  }) {
    const query = new URLSearchParams({
      expectedMutationVersion: String(options.expectedMutationVersion),
      dentistId: options.dentistId,
      serviceId: options.serviceId,
      date: options.date,
    });
    return parseAvailability(await this.#protected({
      path: `appointments/${options.id}/availability?${query}`, signal: options.signal,
    }), options);
  }

  async updateStatus(id: string, expectedMutationVersion: number, status: Exclude<StaffAppointmentStatus, "pending" | "cancelled">) {
    return parseAppointmentResponse(await this.#protected({
      path: `appointments/${id}/status`, method: "PATCH", body: { expectedMutationVersion, status },
    }));
  }

  async cancelAppointment(id: string, expectedMutationVersion: number, reason: string) {
    return parseAppointmentResponse(await this.#protected({
      path: `appointments/${id}/cancel`, method: "POST", body: { expectedMutationVersion, reason },
    }));
  }

  async rescheduleAppointment(id: string, payload: ReschedulePayload) {
    return parseAppointmentResponse(await this.#protected({
      path: `appointments/${id}/reschedule`, method: "PATCH", body: payload, timeoutMs: 12_000,
    }));
  }
}

export const staffApi = new StaffApiClient();
