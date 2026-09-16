import type { StaffRole } from "@/api/staff-client";

export type GovernedStaff = {
  id: string; name: string; email: string; role: StaffRole;
  isActive: boolean; isSetupComplete: boolean;
  deactivatedAt: string | null; createdAt: string; updatedAt: string;
};
export type GovernancePagination = { page: number; limit: number; total: number; pages: number };
export type StaffFilters = { role?: StaffRole; isActive?: boolean; setupComplete?: boolean; page: number; limit: number };
export type AuditFilters = { action?: string; entityType?: string; entityId?: string; actorId?: string; from?: string; to?: string; page: number; limit: number };
export type AuditMetadata = null | string | number | boolean | AuditMetadata[] | { [key: string]: AuditMetadata };
export type AuditActor = { id: string; name: string; email: string; role: StaffRole };
export type GovernedAudit = {
  id: string; requestId: string; actor: AuditActor | null; action: string;
  entityType: string; entityId: string; method: string; path: string;
  metadata: AuditMetadata; createdAt: string;
};
const objectId = /^[a-f\d]{24}$/i;
const roleValues = new Set(["admin", "receptionist", "dentist"]);
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
function invalid(): never { throw new Error("Invalid governance protocol"); }
function text(value: unknown, max: number, empty = true): string {
  if (typeof value !== "string" || value.length > max || (!empty && !value) || /[\u0000-\u001f\u007f]/u.test(value)) invalid();
  return value;
}
function id(value: unknown): string {
  if (typeof value !== "string" || !objectId.test(value)) invalid();
  return value;
}
function role(value: unknown): StaffRole {
  if (typeof value !== "string" || !roleValues.has(value)) invalid();
  return value as StaffRole;
}
function email(value: unknown): string {
  const result = text(value, 254, false);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(result)) invalid();
  return result;
}
function instant(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) invalid();
  return value;
}
export function parseGovernedStaff(value: unknown): GovernedStaff {
  if (!record(value) || typeof value.isActive !== "boolean" || typeof value.isSetupComplete !== "boolean") invalid();
  return {
    id: id(value._id), name: text(value.name, 100, false), email: email(value.email), role: role(value.role),
    isActive: value.isActive, isSetupComplete: value.isSetupComplete,
    deactivatedAt: value.deactivatedAt === null ? null : instant(value.deactivatedAt),
    createdAt: instant(value.createdAt), updatedAt: instant(value.updatedAt),
  };
}
export function parseGovernancePagination(value: unknown, expected: { page: number; limit: number }): GovernancePagination {
  if (!record(value) || ![value.page, value.limit, value.total, value.pages].every(Number.isSafeInteger) ||
    value.page !== expected.page || value.limit !== expected.limit || expected.page < 1 || expected.limit < 1 || expected.limit > 100 ||
    (value.total as number) < 0 || (value.pages as number) !== Math.ceil((value.total as number) / expected.limit)) invalid();
  return { page: value.page as number, limit: value.limit as number, total: value.total as number, pages: value.pages as number };
}
function list<T extends { id: string }>(value: unknown, limit: number, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(value) || value.length > limit || value.length > 100) invalid();
  const result = value.map(parse);
  if (new Set(result.map((item) => item.id)).size !== result.length) invalid();
  return result;
}
export function parseStaffPage(value: unknown, expected: { page: number; limit: number }) {
  if (!record(value)) invalid();
  const staff = list(value.staff, expected.limit, parseGovernedStaff);
  const pagination = parseGovernancePagination(value.pagination, expected);
  if (staff.length > pagination.total) invalid();
  return { staff, pagination };
}
function sensitiveKey(key: string) {
  const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return /password|secret|authorization|cookie|email|phone|patient|internalnote|jwt|requestbody/u.test(normalized) || normalized.endsWith("token") || normalized === "body";
}
export function parseAuditMetadata(value: unknown): AuditMetadata {
  let nodes = 0;
  function parse(child: unknown, depth: number): AuditMetadata {
    if (++nodes > 1000 || depth > 4) invalid();
    if (child === null || typeof child === "boolean") return child;
    if (typeof child === "number" && Number.isFinite(child)) return child;
    if (typeof child === "string") {
      if (child.length > 500) invalid();
      return child;
    }
    if (Array.isArray(child)) {
      if (child.length > 20) invalid();
      return child.map((item) => parse(item, depth + 1));
    }
    if (!record(child) || Object.keys(child).length > 50) invalid();
    const result: Record<string, AuditMetadata> = {};
    for (const [key, item] of Object.entries(child)) {
      if (!key || key.length > 80 || /[.$\u0000-\u001f\u007f]/u.test(key) || ["__proto__", "constructor", "prototype"].includes(key) || sensitiveKey(key)) invalid();
      result[key] = parse(item, depth + 1);
    }
    return result;
  }
  return parse(value, 0);
}
export function parseGovernedAudit(value: unknown): GovernedAudit {
  if (!record(value)) invalid();
  let actor: AuditActor | null = null;
  if (value.actor !== null) {
    if (!record(value.actor)) invalid();
    actor = { id: id(value.actor._id), name: text(value.actor.name, 100, false), email: email(value.actor.email), role: role(value.actor.role) };
  }
  const method = text(value.method, 12);
  const path = text(value.path, 500);
  if (method && !/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/u.test(method)) invalid();
  if (path && (!path.startsWith("/") || /[?#]/u.test(path))) invalid();
  return { id: id(value._id), requestId: text(value.requestId, 100), actor,
    action: text(value.action, 120), entityType: text(value.entityType, 80), entityId: text(value.entityId, 150),
    method, path, metadata: parseAuditMetadata(value.metadata), createdAt: instant(value.createdAt) };
}
export function parseAuditPage(value: unknown, expected: { page: number; limit: number }) {
  if (!record(value)) invalid();
  const logs = list(value.logs, expected.limit, parseGovernedAudit);
  const pagination = parseGovernancePagination(value.pagination, expected);
  if (logs.length > pagination.total) invalid();
  return { logs, pagination };
}
// The operator enters explicitly labeled UTC values, not browser-local times.
export function utcFilterInstant(value: string): string | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/u.test(value)) invalid();
  return instant(`${value.length === 16 ? `${value}:00` : value}.000Z`);
}
