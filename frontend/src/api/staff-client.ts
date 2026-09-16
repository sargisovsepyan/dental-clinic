import type { components } from "@/api/generated/schema";
import { parseGovernedStaff, parseStaffPage, parseAuditPage, type StaffFilters, type AuditFilters } from "@/api/staff-governance";
import {
  localDatePattern,
  objectIdPattern,
  parseCategory,
  parseClinic,
  parseClinicClosure,
  parseDentist,
  parseScheduleConflictDetails,
  parseScheduleException,
  parseService,
  type ClinicClosurePayload,
  type CreateCategoryPayload,
  type CreateDentistPayload,
  type CreateServicePayload,
  type ScheduleConflictDetails,
  type ScheduleExceptionPayload,
  type UpdateCategoryPayload,
  type UpdateClinicPayload,
  type UpdateDentistPayload,
  type UpdateServicePayload,
} from "@/api/staff-management";
import {
  beforeAfterUploadForm,
  galleryUploadForm,
  isMediaRecord,
  parseBeforeAfterCase,
  parseBeforeAfterMutation,
  parseCleanupJob,
  parseGalleryImage,
  parseImageMutation,
  parseMediaPagination,
  type BeforeAfterUpdatePayload,
  type BeforeAfterUploadPayload,
  type GalleryUpdatePayload,
  type GalleryUploadPayload,
  type MediaCleanupStatus,
} from "@/api/staff-media";
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
  readonly scheduleConflict?: ScheduleConflictDetails;

  constructor(options: {
    kind: ErrorKind;
    status?: number;
    code?: string;
    requestId?: string;
    retryAfterSeconds?: number;
    currentMutationVersion?: number;
    scheduleConflict?: ScheduleConflictDetails;
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
    this.scheduleConflict = options.scheduleConflict;
  }
}

type RequestOptions = {
  path: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
  credentials?: RequestCredentials;
  authorization?: string;
  timeoutMs?: number;
};

const roles = new Set<unknown>(["admin", "receptionist", "dentist"]);
const statuses = new Set<unknown>([
  "pending", "confirmed", "checked_in", "in_progress", "completed", "cancelled", "no_show",
]);
const objectId = objectIdPattern;
const safeHeader = /^[A-Za-z0-9._:-]{1,128}$/;
const safeCode = /^[A-Z0-9_]{1,80}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

function apiUrl(path: string) {
  if (!/^[a-z0-9][a-z0-9/?=&._%+-]*$/i.test(path) || path.includes("..")) {
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
  if (options.body !== undefined && options.formData) {
    throw new StaffApiError({ kind: "configuration" });
  }
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
      ...(options.formData
        ? { body: options.formData }
        : options.body !== undefined
          ? { body: JSON.stringify(options.body) }
          : {}),
    });
  } catch (cause) {
    clearTimeout(timeout);
    if (options.signal?.aborted) throw new StaffApiError({ kind: "cancelled", cause });
    if (timeoutController.signal.aborted) throw new StaffApiError({ kind: "timeout", cause });
    throw new StaffApiError({ kind: "network", cause });
  }

  const requestIdValue = response.headers.get("x-request-id");
  const requestId = requestIdValue && safeHeader.test(requestIdValue) ? requestIdValue : undefined;
  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    if (options.signal?.aborted) throw new StaffApiError({ kind: "cancelled", status: response.status, requestId, cause });
    if (timeoutController.signal.aborted) throw new StaffApiError({ kind: "timeout", status: response.status, requestId, cause });
    throw new StaffApiError({ kind: "protocol", status: response.status, requestId, cause });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    const codeValue = isRecord(body) ? body.code : undefined;
    const details = isRecord(body) && isRecord(body.details) ? body.details : undefined;
    const currentMutationVersion = details?.currentMutationVersion;
    let scheduleConflict: ScheduleConflictDetails | undefined;
    try {
      const parsed = parseScheduleConflictDetails(details);
      if (Object.keys(parsed).length > 0) scheduleConflict = parsed;
    } catch (cause) {
      throw new StaffApiError({ kind: "protocol", status: response.status, requestId, cause });
    }
    throw new StaffApiError({
      kind: "http",
      status: response.status,
      requestId,
      code: typeof codeValue === "string" && safeCode.test(codeValue) ? codeValue : undefined,
      retryAfterSeconds: parsePositiveInteger(response.headers.get("retry-after")),
      currentMutationVersion: Number.isInteger(currentMutationVersion)
        ? currentMutationVersion as number
        : undefined,
      scheduleConflict,
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
let sameTabSessionTail: Promise<void> = Promise.resolve();
const sessionLockName = "dental-clinic-staff-refresh";

async function withSessionLock<T>(operation: () => Promise<T>) {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request(sessionLockName, { mode: "exclusive" }, operation);
  }
  const result = sameTabSessionTail.then(operation, operation);
  sameTabSessionTail = result.then(() => undefined, () => undefined);
  return result;
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
  #principal: Pick<StaffUser, "id" | "role"> | null = null;
  #sessionEpoch = 0;

  hasAccessToken() {
    return this.#accessToken !== null;
  }

  async listStaff(filters: StaffFilters, signal?: AbortSignal) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value !== undefined) query.set(key, String(value));
    const data = dataRecord(await this.#protected({ path: `staff?${query}`, signal }));
    try { return parseStaffPage(data, filters); }
    catch (cause) { throw new StaffApiError({ kind: "protocol", cause }); }
  }

  async getStaff(id: string, signal?: AbortSignal) {
    if (!objectId.test(id)) throw new StaffApiError({ kind: "configuration" });
    const data = dataRecord(await this.#protected({ path: `staff/${id}`, signal }));
    try {
      const staff = parseGovernedStaff(data.staff);
      if (staff.id !== id) throw new Error("Staff identity mismatch");
      return staff;
    } catch (cause) { throw new StaffApiError({ kind: "protocol", cause }); }
  }

  async inviteStaff(payload: { name: string; email: string; role: StaffRole }) {
    // Authentication precedes the side effect. Only a definitive 401 may refresh;
    // timeout, cancellation, network, 5xx, and malformed results are never replayed.
    const data = dataRecord(await this.#protected({ path: "staff/invite", method: "POST",
      body: { name: payload.name, email: payload.email, role: payload.role } }));
    try { return parseGovernedStaff(data.staff); }
    catch (cause) { throw new StaffApiError({ kind: "protocol", cause }); }
  }

  async mutateStaff(id: string, action: "role" | "deactivate" | "reactivate" | "revoke-sessions", role?: StaffRole) {
    if (!objectId.test(id) || (action === "role" && !roles.has(role))) throw new StaffApiError({ kind: "configuration" });
    const data = dataRecord(await this.#protected({ path: `staff/${id}/${action}`, method: action === "role" ? "PATCH" : "POST",
      ...(action === "role" ? { body: { role } } : {}) }));
    try {
      const staff = parseGovernedStaff(data.staff);
      if (staff.id !== id) throw new Error("Staff identity mismatch");
      return staff;
    } catch (cause) { throw new StaffApiError({ kind: "protocol", cause }); }
  }

  async listAuditLogs(filters: AuditFilters, signal?: AbortSignal) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== "") query.set(key, String(value));
    const data = dataRecord(await this.#protected({ path: `audit-logs?${query}`, signal }));
    try { return parseAuditPage(data, filters); }
    catch (cause) { throw new StaffApiError({ kind: "protocol", cause }); }
  }

  clearSession() {
    this.#accessToken = null;
    this.#principal = null;
    this.#sessionEpoch += 1;
  }

  #setPrincipal(user: StaffUser) {
    this.#principal = { id: user.id, role: user.role };
  }

  #samePrincipal(user: StaffUser) {
    return this.#principal?.id === user.id && this.#principal.role === user.role;
  }

  async login(email: string, password: string) {
    const sessionEpoch = ++this.#sessionEpoch;
    this.#accessToken = null;
    const result = parseAuth(await withSessionLock(() => rawRequest({
      path: "auth/login", method: "POST", credentials: "include", body: { email, password },
    })));
    if (sessionEpoch !== this.#sessionEpoch) {
      throw new StaffApiError({ kind: "cancelled", status: 401 });
    }
    this.#accessToken = result.accessToken;
    this.#setPrincipal(result.user);
    return result.user;
  }

  async bootstrap() {
    const sessionEpoch = this.#sessionEpoch;
    const refreshed = await coordinatedRefresh();
    if (sessionEpoch !== this.#sessionEpoch) {
      throw new StaffApiError({ kind: "cancelled", status: 401 });
    }
    this.#accessToken = refreshed.accessToken;
    this.#setPrincipal(refreshed.user);
    try {
      const body = await rawRequest({ path: "auth/me", authorization: this.#accessToken });
      const current = parseUser(dataRecord(body).user);
      if (!this.#samePrincipal(current)) {
        this.clearSession();
        throw new StaffApiError({ kind: "http", status: 401, code: "SESSION_IDENTITY_CHANGED" });
      }
      this.#setPrincipal(current);
      return current;
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
      if (!(error instanceof StaffApiError) || error.kind !== "http" || error.status !== 401 || !allowRefresh) throw error;
      if (sessionEpoch !== this.#sessionEpoch) throw new StaffApiError({ kind: "cancelled", status: 401 });
      try {
        const refreshed = await coordinatedRefresh();
        if (sessionEpoch !== this.#sessionEpoch) throw new StaffApiError({ kind: "cancelled", status: 401 });
        if (!this.#samePrincipal(refreshed.user)) {
          this.clearSession();
          throw new StaffApiError({ kind: "http", status: 401, code: "SESSION_IDENTITY_CHANGED" });
        }
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

  async listCategories(signal?: AbortSignal) {
    const data = dataRecord(await this.#protected({ path: "service-categories/admin/all", signal }));
    if (!Array.isArray(data.categories)) throw new StaffApiError({ kind: "protocol" });
    try { return data.categories.map(parseCategory); }
    catch (cause) { throw new StaffApiError({ kind: "protocol", cause }); }
  }

  async createCategory(payload: CreateCategoryPayload) {
    await this.#protected({ path: "service-categories", method: "POST", body: payload });
  }

  async updateCategory(id: string, payload: UpdateCategoryPayload) {
    if (!objectId.test(id)) throw new StaffApiError({ kind: "configuration" });
    await this.#protected({ path: `service-categories/${id}`, method: "PATCH", body: payload });
  }

  async disableCategory(id: string) {
    if (!objectId.test(id)) throw new StaffApiError({ kind: "configuration" });
    await this.#protected({ path: `service-categories/${id}`, method: "DELETE" });
  }

  async restoreCategory(id: string) {
    if (!objectId.test(id)) throw new StaffApiError({ kind: "configuration" });
    await this.#protected({ path: `service-categories/${id}/restore`, method: "PATCH" });
  }

  async listServices(signal?: AbortSignal) {
    const data = dataRecord(await this.#protected({ path: "services/admin/all", signal }));
    if (!Array.isArray(data.services)) throw new StaffApiError({ kind: "protocol" });
    try { return data.services.map(parseService); }
    catch (cause) { throw new StaffApiError({ kind: "protocol", cause }); }
  }

  async createService(payload: CreateServicePayload) {
    await this.#protected({ path: "services", method: "POST", body: payload });
  }

  async updateService(id: string, payload: UpdateServicePayload) {
    if (!objectId.test(id)) throw new StaffApiError({ kind: "configuration" });
    await this.#protected({ path: `services/${id}`, method: "PATCH", body: payload });
  }

  async disableService(id: string) {
    if (!objectId.test(id)) throw new StaffApiError({ kind: "configuration" });
    await this.#protected({ path: `services/${id}`, method: "DELETE" });
  }

  async restoreService(id: string) {
    if (!objectId.test(id)) throw new StaffApiError({ kind: "configuration" });
    await this.#protected({ path: `services/${id}/restore`, method: "PATCH" });
  }

  async listDentists(signal?: AbortSignal) {
    const data = dataRecord(await this.#protected({ path: "dentists/admin/all", signal }));
    if (!Array.isArray(data.dentists)) throw new StaffApiError({ kind: "protocol" });
    try { return data.dentists.map(parseDentist); }
    catch (cause) { throw new StaffApiError({ kind: "protocol", cause }); }
  }

  async createDentist(payload: CreateDentistPayload) {
    await this.#protected({ path: "dentists", method: "POST", body: payload });
  }

  async updateDentist(id: string, payload: UpdateDentistPayload) {
    if (!objectId.test(id)) throw new StaffApiError({ kind: "configuration" });
    const data = dataRecord(await this.#protected({ path: `dentists/${id}`, method: "PATCH", body: payload, timeoutMs: 15_000 }));
    try { return parseDentist(data.dentist); }
    catch (cause) { throw new StaffApiError({ kind: "protocol", cause }); }
  }

  async disableDentist(id: string) {
    if (!objectId.test(id)) throw new StaffApiError({ kind: "configuration" });
    await this.#protected({ path: `dentists/${id}`, method: "DELETE" });
  }

  async restoreDentist(id: string) {
    if (!objectId.test(id)) throw new StaffApiError({ kind: "configuration" });
    await this.#protected({ path: `dentists/${id}/restore`, method: "PATCH" });
  }

  async getClinic(signal?: AbortSignal) {
    const data = dataRecord(await this.#protected({ path: "clinic", signal }));
    try { return parseClinic(data.clinic); }
    catch (cause) { throw new StaffApiError({ kind: "protocol", cause }); }
  }

  async updateClinic(payload: UpdateClinicPayload) {
    const data = dataRecord(await this.#protected({ path: "clinic", method: "PATCH", body: payload, timeoutMs: 15_000 }));
    try { return parseClinic(data.clinic); }
    catch (cause) { throw new StaffApiError({ kind: "protocol", cause }); }
  }

  async listScheduleExceptions(id: string, from?: string, to?: string, signal?: AbortSignal) {
    if (!objectId.test(id) || (from && !localDatePattern.test(from)) || (to && !localDatePattern.test(to))) {
      throw new StaffApiError({ kind: "configuration" });
    }
    const query = new URLSearchParams();
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    const suffix = query.size ? `?${query}` : "";
    const data = dataRecord(await this.#protected({ path: `dentists/${id}/schedule-exceptions${suffix}`, signal }));
    if (!Array.isArray(data.exceptions)) throw new StaffApiError({ kind: "protocol" });
    try { return data.exceptions.map(parseScheduleException); }
    catch (cause) { throw new StaffApiError({ kind: "protocol", cause }); }
  }

  async setScheduleException(id: string, date: string, payload: ScheduleExceptionPayload) {
    if (!objectId.test(id) || !localDatePattern.test(date)) throw new StaffApiError({ kind: "configuration" });
    await this.#protected({ path: `dentists/${id}/schedule-exceptions/${date}`, method: "PUT", body: payload, timeoutMs: 15_000 });
  }

  async deleteScheduleException(id: string, date: string, expectedScheduleRevision: number, acknowledgement?: string) {
    if (!objectId.test(id) || !localDatePattern.test(date)) throw new StaffApiError({ kind: "configuration" });
    const query = new URLSearchParams({ expectedScheduleRevision: String(expectedScheduleRevision) });
    if (acknowledgement) query.set("scheduleConflictAcknowledgement", acknowledgement);
    await this.#protected({ path: `dentists/${id}/schedule-exceptions/${date}?${query}`, method: "DELETE", timeoutMs: 15_000 });
  }

  async listClinicClosures(from?: string, to?: string, signal?: AbortSignal) {
    if ((from && !localDatePattern.test(from)) || (to && !localDatePattern.test(to))) {
      throw new StaffApiError({ kind: "configuration" });
    }
    const query = new URLSearchParams();
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    const suffix = query.size ? `?${query}` : "";
    const data = dataRecord(await this.#protected({ path: `clinic/closures${suffix}`, signal }));
    if (!Array.isArray(data.closures)) throw new StaffApiError({ kind: "protocol" });
    try { return data.closures.map(parseClinicClosure); }
    catch (cause) { throw new StaffApiError({ kind: "protocol", cause }); }
  }

  async setClinicClosure(date: string, payload: ClinicClosurePayload) {
    if (!localDatePattern.test(date)) throw new StaffApiError({ kind: "configuration" });
    await this.#protected({ path: `clinic/closures/${date}`, method: "PUT", body: payload, timeoutMs: 15_000 });
  }

  async deleteClinicClosure(date: string, expectedScheduleRevision: number, acknowledgement?: string) {
    if (!localDatePattern.test(date)) throw new StaffApiError({ kind: "configuration" });
    const query = new URLSearchParams({ expectedScheduleRevision: String(expectedScheduleRevision) });
    if (acknowledgement) query.set("scheduleConflictAcknowledgement", acknowledgement);
    await this.#protected({ path: `clinic/closures/${date}?${query}`, method: "DELETE", timeoutMs: 15_000 });
  }

  async listGallery(signal?: AbortSignal) {
    const data = dataRecord(await this.#protected({ path: "media/gallery/admin", signal }));
    if (!Array.isArray(data.images)) throw new StaffApiError({ kind: "protocol" });
    try { return data.images.map(parseGalleryImage); }
    catch (cause) { throw new StaffApiError({ kind: "protocol", cause }); }
  }

  async createGalleryImage(payload: GalleryUploadPayload, signal?: AbortSignal) {
    const data = dataRecord(await this.#protected({
      path: "media/gallery", method: "POST", formData: galleryUploadForm(payload),
      timeoutMs: 45_000, signal,
    }));
    try { return parseGalleryImage(data.image); }
    catch (cause) { throw new StaffApiError({ kind: "protocol", cause }); }
  }

  async updateGalleryImage(id: string, payload: GalleryUpdatePayload) {
    if (!objectId.test(id)) throw new StaffApiError({ kind: "configuration" });
    const data = dataRecord(await this.#protected({
      path: `media/gallery/${id}`, method: "PATCH", body: payload,
    }));
    try { return parseGalleryImage(data.image); }
    catch (cause) { throw new StaffApiError({ kind: "protocol", cause }); }
  }

  async disableGalleryImage(id: string) {
    if (!objectId.test(id)) throw new StaffApiError({ kind: "configuration" });
    await this.#protected({ path: `media/gallery/${id}`, method: "DELETE" });
  }

  async restoreGalleryImage(id: string) {
    if (!objectId.test(id)) throw new StaffApiError({ kind: "configuration" });
    const data = dataRecord(await this.#protected({ path: `media/gallery/${id}/restore`, method: "PATCH" }));
    try { return parseGalleryImage(data.image); }
    catch (cause) { throw new StaffApiError({ kind: "protocol", cause }); }
  }

  async #replaceEntityImage(kind: "dentists" | "services", id: string, file: File, signal?: AbortSignal) {
    if (!objectId.test(id)) throw new StaffApiError({ kind: "configuration" });
    const formData = new FormData();
    formData.append("image", file);
    // Auth runs before multipart parsing on these endpoints, so an explicit 401
    // is safe to refresh and replay once. Timeout/network failures are never replayed.
    const data = dataRecord(await this.#protected({
      path: `media/${kind}/${id}/${kind === "dentists" ? "photo" : "image"}`,
      method: "PUT", formData, timeoutMs: 45_000, signal,
    }));
    const field = kind === "dentists" ? "dentist" : "service";
    if (!isMediaRecord(data[field])) throw new StaffApiError({ kind: "protocol" });
    try { return parseImageMutation(data[field], id, kind === "dentists" ? "photo" : "image"); }
    catch (cause) { throw new StaffApiError({ kind: "protocol", cause }); }
  }

  async #removeEntityImage(kind: "dentists" | "services", id: string) {
    if (!objectId.test(id)) throw new StaffApiError({ kind: "configuration" });
    const data = dataRecord(await this.#protected({
      path: `media/${kind}/${id}/${kind === "dentists" ? "photo" : "image"}`, method: "DELETE",
    }));
    const field = kind === "dentists" ? "dentist" : "service";
    if (!isMediaRecord(data[field])) throw new StaffApiError({ kind: "protocol" });
    try { return parseImageMutation(data[field], id, kind === "dentists" ? "photo" : "image"); }
    catch (cause) { throw new StaffApiError({ kind: "protocol", cause }); }
  }

  replaceDentistPhoto(id: string, file: File, signal?: AbortSignal) {
    return this.#replaceEntityImage("dentists", id, file, signal);
  }

  removeDentistPhoto(id: string) {
    return this.#removeEntityImage("dentists", id);
  }

  replaceServiceImage(id: string, file: File, signal?: AbortSignal) {
    return this.#replaceEntityImage("services", id, file, signal);
  }

  removeServiceImage(id: string) {
    return this.#removeEntityImage("services", id);
  }

  async listMediaCleanupJobs(options: { page?: number; status?: MediaCleanupStatus } = {}, signal?: AbortSignal) {
    const query = new URLSearchParams({ page: String(options.page ?? 1), limit: "50" });
    if (options.status) query.set("status", options.status);
    const data = dataRecord(await this.#protected({ path: `media/cleanup-jobs?${query}`, signal }));
    if (!Array.isArray(data.jobs)) throw new StaffApiError({ kind: "protocol" });
    try {
      return { jobs: data.jobs.map(parseCleanupJob), pagination: parseMediaPagination(data.pagination) };
    } catch (cause) { throw new StaffApiError({ kind: "protocol", cause }); }
  }

  async retryMediaCleanupJob(id: string) {
    if (!objectId.test(id)) throw new StaffApiError({ kind: "configuration" });
    const data = dataRecord(await this.#protected({ path: `media/cleanup-jobs/${id}/retry`, method: "POST" }));
    try { return parseCleanupJob(data.job); }
    catch (cause) { throw new StaffApiError({ kind: "protocol", cause }); }
  }

  async listBeforeAfterCases(page = 1, signal?: AbortSignal) {
    if (!Number.isInteger(page) || page < 1) throw new StaffApiError({ kind: "configuration" });
    const data = dataRecord(await this.#protected({ path: `before-after/admin/all?page=${page}&limit=24`, signal }));
    if (!Array.isArray(data.cases)) throw new StaffApiError({ kind: "protocol" });
    try {
      return { cases: data.cases.map(parseBeforeAfterCase), pagination: parseMediaPagination(data.pagination) };
    } catch (cause) { throw new StaffApiError({ kind: "protocol", cause }); }
  }

  async createBeforeAfterCase(payload: BeforeAfterUploadPayload, signal?: AbortSignal) {
    const data = dataRecord(await this.#protected({
      path: "before-after", method: "POST", formData: beforeAfterUploadForm(payload),
      timeoutMs: 60_000, signal,
    }));
    try { return parseBeforeAfterCase(data.case); }
    catch (cause) { throw new StaffApiError({ kind: "protocol", cause }); }
  }

  async updateBeforeAfterCase(id: string, payload: BeforeAfterUpdatePayload) {
    if (!objectId.test(id)) throw new StaffApiError({ kind: "configuration" });
    const data = dataRecord(await this.#protected({
      path: `before-after/${id}`,
      method: "PATCH",
      body: {
        translations: payload.translations,
        ...(payload.serviceId !== undefined ? { serviceId: payload.serviceId } : {}),
        ...(payload.dentistId !== undefined ? { dentistId: payload.dentistId } : {}),
        isFeatured: payload.featured,
        sortOrder: payload.sortOrder,
      },
    }));
    try { return parseBeforeAfterCase(data.case); }
    catch (cause) { throw new StaffApiError({ kind: "protocol", cause }); }
  }

  async disableBeforeAfterCase(id: string) {
    if (!objectId.test(id)) throw new StaffApiError({ kind: "configuration" });
    await this.#protected({ path: `before-after/${id}`, method: "DELETE" });
  }

  async restoreBeforeAfterCase(id: string) {
    if (!objectId.test(id)) throw new StaffApiError({ kind: "configuration" });
    const data = dataRecord(await this.#protected({ path: `before-after/${id}/restore`, method: "PATCH" }));
    try { return parseBeforeAfterMutation(data.case, id); }
    catch (cause) { throw new StaffApiError({ kind: "protocol", cause }); }
  }

  async replaceBeforeAfterImage(id: string, side: "before" | "after", file: File, signal?: AbortSignal) {
    if (!objectId.test(id)) throw new StaffApiError({ kind: "configuration" });
    const formData = new FormData();
    formData.append("image", file);
    const data = dataRecord(await this.#protected({
      path: `before-after/${id}/${side}-image`, method: "PUT", formData, timeoutMs: 45_000, signal,
    }));
    try { return parseBeforeAfterMutation(data.case, id); }
    catch (cause) { throw new StaffApiError({ kind: "protocol", cause }); }
  }

  async withdrawBeforeAfterConsent(id: string, reason: string) {
    if (!objectId.test(id)) throw new StaffApiError({ kind: "configuration" });
    const data = dataRecord(await this.#protected({
      path: `before-after/${id}/consent/withdraw`, method: "POST", body: { reason },
    }));
    try { return parseBeforeAfterMutation(data.case, id); }
    catch (cause) { throw new StaffApiError({ kind: "protocol", cause }); }
  }

  async purgeBeforeAfterCase(id: string, reason: string) {
    if (!objectId.test(id)) throw new StaffApiError({ kind: "configuration" });
    const data = dataRecord(await this.#protected({
      path: `before-after/${id}/purge`, method: "POST",
      body: { confirmation: "PERMANENTLY PURGE BEFORE AFTER MEDIA", reason },
    }));
    try { return parseBeforeAfterMutation(data.case, id); }
    catch (cause) { throw new StaffApiError({ kind: "protocol", cause }); }
  }
}

export const staffApi = new StaffApiClient();
