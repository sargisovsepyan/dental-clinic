import type { PublicImageAsset } from "@/lib/safe-urls";

export const MAX_MEDIA_FILE_BYTES = 5 * 1024 * 1024;
export const MEDIA_FILE_ACCEPT = [
  ".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif",
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
].join(",");

export type MediaLocale = "hy" | "ru" | "en";
export type GalleryTranslation = { altText?: string; caption?: string };
export type GalleryTranslations = Partial<Record<MediaLocale, GalleryTranslation>>;
export type BeforeAfterTranslation = { title?: string; description?: string };
export type BeforeAfterTranslations = Partial<Record<MediaLocale, BeforeAfterTranslation>>;

export type StaffGalleryImage = {
  id: string;
  image: PublicImageAsset;
  altText: string;
  caption: string;
  translations: GalleryTranslations;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StaffMediaRelation = {
  id: string;
  label: string;
};

export type ConsentStatus = "active" | "unverified" | "withdrawn" | "purged";
export type PublicationStatus = "draft" | "published" | "withdrawn" | "purged";
export type ConsentMethod = "written" | "digital" | "verbal" | "external" | "legacy_migrated" | "legacy_unverified";

export type StaffBeforeAfterCase = {
  id: string;
  title: string;
  description: string;
  translations: BeforeAfterTranslations;
  service: StaffMediaRelation | null;
  dentist: StaffMediaRelation | null;
  beforeImage: PublicImageAsset | null;
  afterImage: PublicImageAsset | null;
  publicationStatus: PublicationStatus;
  consentStatus: ConsentStatus;
  consentPolicyVersion: string;
  consentMethod: ConsentMethod;
  consentConfirmedAt: string | null;
  externalConsentReference: string;
  withdrawnAt: string | null;
  withdrawalReason: string;
  purgedAt: string | null;
  featured: boolean;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type MediaCleanupStatus = "held" | "pending" | "processing" | "completed" | "failed" | "cancelled";
export type StaffMediaCleanupJob = {
  id: string;
  reason: "replacement" | "removal" | "rollback" | "consent_purge" | "reconciliation";
  sourceType: string;
  status: MediaCleanupStatus;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string;
  lastErrorCode: string;
  createdAt: string;
  updatedAt: string;
};

export type StaffMediaPagination = { page: number; limit: number; total: number; pages: number };

export type GalleryUploadPayload = {
  image: File;
  translations: GalleryTranslations;
  sortOrder: number;
  active: boolean;
};

export type GalleryUpdatePayload = {
  translations: GalleryTranslations;
  sortOrder: number;
};

export type BeforeAfterUploadPayload = {
  beforeImage: File;
  afterImage: File;
  translations: BeforeAfterTranslations;
  serviceId?: string;
  dentistId?: string;
  consentMethod: "written" | "digital" | "verbal" | "external";
  externalConsentReference?: string;
  active: boolean;
  featured: boolean;
  sortOrder: number;
};

export type BeforeAfterUpdatePayload = {
  translations: BeforeAfterTranslations;
  serviceId?: string;
  dentistId?: string;
  featured: boolean;
  sortOrder: number;
};

export type MediaFileProblem = "empty" | "too-large" | "unsupported";

const objectIdPattern = /^[0-9a-f]{24}$/i;
const mediaMimeByExtension = new Map([
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
  ["heic", "image/heic"],
  ["heif", "image/heif"],
]);
const consentStatuses = new Set<unknown>(["active", "unverified", "withdrawn", "purged"]);
const publicationStatuses = new Set<unknown>(["draft", "published", "withdrawn", "purged"]);
const consentMethods = new Set<unknown>(["written", "digital", "verbal", "external", "legacy_migrated", "legacy_unverified"]);
const cleanupStatuses = new Set<unknown>(["held", "pending", "processing", "completed", "failed", "cancelled"]);
const cleanupReasons = new Set<unknown>(["replacement", "removal", "rollback", "consent_purge", "reconciliation"]);

export const isMediaRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

function protocol(): never {
  throw new Error("Invalid staff media response");
}

function string(value: unknown, maxLength: number) {
  if (typeof value !== "string" || value.length > maxLength) protocol();
  return value;
}

function id(value: unknown) {
  const result = string(value, 24);
  if (!objectIdPattern.test(result)) protocol();
  return result;
}

function integer(value: unknown, min: number, max: number) {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) protocol();
  return value as number;
}

function boolean(value: unknown) {
  if (typeof value !== "boolean") protocol();
  return value;
}

function dateTime(value: unknown) {
  const result = string(value, 64);
  if (!Number.isFinite(Date.parse(result))) protocol();
  return result;
}

function nullableDateTime(value: unknown) {
  return value === null || value === undefined ? null : dateTime(value);
}

function parseImage(value: unknown, nullable = false): PublicImageAsset | null {
  if (nullable && value === null) return null;
  if (!isMediaRecord(value)) protocol();
  return {
    publicId: string(value.publicId, 500),
    secureUrl: string(value.secureUrl, 2_000),
    width: integer(value.width, 1, 20_000),
    height: integer(value.height, 1, 20_000),
    format: string(value.format, 32),
    bytes: integer(value.bytes, 1, 100_000_000),
  };
}

export function parseImageMutation(value: unknown, expectedId: string, field: "photo" | "image") {
  if (!isMediaRecord(value) || id(value._id) !== expectedId) protocol();
  return parseImage(value[field], true);
}

function parseTranslations<T extends string>(value: unknown, fields: readonly T[], limits: Record<T, number>) {
  if (!isMediaRecord(value)) protocol();
  const result: Partial<Record<MediaLocale, Partial<Record<T, string>>>> = {};
  for (const locale of ["hy", "ru", "en"] as const) {
    const translation = value[locale];
    if (translation === undefined) continue;
    if (!isMediaRecord(translation)) protocol();
    const entry: Partial<Record<T, string>> = {};
    for (const field of fields) {
      if (translation[field] !== undefined) entry[field] = string(translation[field], limits[field]);
    }
    result[locale] = entry;
  }
  return result;
}

export function parseGalleryImage(value: unknown): StaffGalleryImage {
  if (!isMediaRecord(value) || value.type !== "clinic_gallery") protocol();
  return {
    id: id(value._id),
    image: parseImage(value.image) as PublicImageAsset,
    altText: string(value.altText, 200),
    caption: string(value.caption, 500),
    translations: parseTranslations(value.translations, ["altText", "caption"], { altText: 200, caption: 500 }),
    sortOrder: integer(value.sortOrder, 0, 10_000),
    active: boolean(value.isActive),
    createdAt: dateTime(value.createdAt),
    updatedAt: dateTime(value.updatedAt),
  };
}

function parseRelation(value: unknown, type: "service" | "dentist") {
  if (value === null) return null;
  if (!isMediaRecord(value)) protocol();
  const label = type === "dentist"
    ? `${string(value.firstName, 80)} ${string(value.lastName, 80)}`.trim()
    : string(value.name, 150);
  return { id: id(value._id), label };
}

export function parseBeforeAfterCase(value: unknown): StaffBeforeAfterCase {
  if (
    !isMediaRecord(value) || !publicationStatuses.has(value.publicationStatus) ||
    !consentStatuses.has(value.consentStatus) || !consentMethods.has(value.consentMethod)
  ) protocol();
  const publicationStatus = value.publicationStatus as PublicationStatus;
  const consentStatus = value.consentStatus as ConsentStatus;
  const beforeImage = parseImage(value.beforeImage, true);
  const afterImage = parseImage(value.afterImage, true);
  const active = boolean(value.isActive);
  if (publicationStatus === "purged" ? beforeImage || afterImage : !beforeImage || !afterImage) protocol();
  if (publicationStatus === "published" && (consentStatus !== "active" || !active)) protocol();
  if ((consentStatus === "withdrawn" || consentStatus === "purged") && active) protocol();
  return {
    id: id(value._id),
    title: string(value.title, 200),
    description: string(value.description, 2_000),
    translations: parseTranslations(value.translations, ["title", "description"], { title: 200, description: 2_000 }),
    service: parseRelation(value.service, "service"),
    dentist: parseRelation(value.dentist, "dentist"),
    beforeImage,
    afterImage,
    publicationStatus,
    consentStatus,
    consentPolicyVersion: string(value.consentPolicyVersion, 40),
    consentMethod: value.consentMethod as ConsentMethod,
    consentConfirmedAt: nullableDateTime(value.consentConfirmedAt),
    externalConsentReference: typeof value.externalConsentReference === "string"
      ? string(value.externalConsentReference, 120)
      : "",
    withdrawnAt: nullableDateTime(value.withdrawnAt),
    withdrawalReason: typeof value.withdrawalReason === "string" ? string(value.withdrawalReason, 500) : "",
    purgedAt: nullableDateTime(value.purgedAt),
    featured: boolean(value.isFeatured),
    active,
    sortOrder: integer(value.sortOrder, 0, 10_000),
    createdAt: dateTime(value.createdAt),
    updatedAt: dateTime(value.updatedAt),
  };
}

export function parseBeforeAfterMutation(value: unknown, expectedId: string) {
  if (
    !isMediaRecord(value) || id(value._id) !== expectedId ||
    !publicationStatuses.has(value.publicationStatus) || !consentStatuses.has(value.consentStatus)
  ) protocol();
  return {
    id: expectedId,
    publicationStatus: value.publicationStatus as PublicationStatus,
    consentStatus: value.consentStatus as ConsentStatus,
  };
}

export function parseMediaPagination(value: unknown): StaffMediaPagination {
  if (!isMediaRecord(value)) protocol();
  return {
    page: integer(value.page, 1, Number.MAX_SAFE_INTEGER),
    limit: integer(value.limit, 1, 100),
    total: integer(value.total, 0, Number.MAX_SAFE_INTEGER),
    pages: integer(value.pages, 0, Number.MAX_SAFE_INTEGER),
  };
}

export function parseCleanupJob(value: unknown): StaffMediaCleanupJob {
  if (!isMediaRecord(value) || !cleanupStatuses.has(value.status) || !cleanupReasons.has(value.reason)) protocol();
  return {
    id: id(value._id),
    reason: value.reason as StaffMediaCleanupJob["reason"],
    sourceType: string(value.sourceType, 80),
    status: value.status as MediaCleanupStatus,
    attempts: integer(value.attempts, 0, 50),
    maxAttempts: integer(value.maxAttempts, 1, 50),
    nextAttemptAt: dateTime(value.nextAttemptAt),
    lastErrorCode: string(value.lastErrorCode, 120),
    createdAt: dateTime(value.createdAt),
    updatedAt: dateTime(value.updatedAt),
  };
}

export function validateMediaFile(file: File | null): MediaFileProblem | null {
  if (!file || file.size === 0) return "empty";
  if (file.size > MAX_MEDIA_FILE_BYTES) return "too-large";
  const extension = file.name.split(".").at(-1)?.toLowerCase() || "";
  if (mediaMimeByExtension.get(extension) !== file.type.toLowerCase()) return "unsupported";
  return null;
}

export function galleryUploadForm(payload: GalleryUploadPayload) {
  const form = new FormData();
  form.append("image", payload.image);
  form.append("translations", JSON.stringify(payload.translations));
  form.append("sortOrder", String(payload.sortOrder));
  form.append("isActive", String(payload.active));
  return form;
}

export function beforeAfterUploadForm(payload: BeforeAfterUploadPayload) {
  const form = new FormData();
  form.append("beforeImage", payload.beforeImage);
  form.append("afterImage", payload.afterImage);
  form.append("translations", JSON.stringify(payload.translations));
  if (payload.serviceId) form.append("serviceId", payload.serviceId);
  if (payload.dentistId) form.append("dentistId", payload.dentistId);
  form.append("consentConfirmed", "true");
  form.append("consentMethod", payload.consentMethod);
  if (payload.consentMethod === "external" && payload.externalConsentReference) {
    form.append("externalConsentReference", payload.externalConsentReference);
  }
  form.append("isActive", String(payload.active));
  form.append("isFeatured", String(payload.featured));
  form.append("sortOrder", String(payload.sortOrder));
  return form;
}
