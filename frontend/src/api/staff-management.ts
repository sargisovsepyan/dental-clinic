import type { components } from "@/api/generated/schema";

export type StaffCategory = components["schemas"]["ServiceCategoryPublic"];
export type StaffService = components["schemas"]["ServicePublic"];
export type StaffClinic = components["schemas"]["ClinicPublic"];
export type Shift = components["schemas"]["Shift"];
export type DentistWorkingDay = components["schemas"]["DentistWorkingDay"];
export type ClinicWorkingDay = components["schemas"]["ClinicWorkingDay"];
export type StaffCategoryTranslations = components["schemas"]["ServiceCategoryTranslations"];
export type StaffServiceTranslations = components["schemas"]["ServiceTranslations"];
export type StaffDentistTranslations = components["schemas"]["DentistTranslations"];
export type StaffClinicTranslations = components["schemas"]["ClinicTranslations"];
export type StaffBookingSettings = components["schemas"]["ClinicBookingSettingsPublic"];
export type PriceType = StaffService["priceType"];
export type DentistLanguage = StaffDentist["languages"][number];

type DentistBase = Omit<components["schemas"]["DentistPublic"], "services">;
export type StaffDentistService = Pick<
  StaffService,
  "_id" | "name" | "slug" | "translations" | "isActive" | "bookingEnabled"
>;
export type StaffDentist = DentistBase & { services: StaffDentistService[] };

export type StaffScheduleException = {
  _id: string;
  dentist: string;
  date: string;
  isWorking: boolean;
  shifts: Shift[];
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type StaffClinicClosure = {
  _id: string;
  date: string;
  isOpen: boolean;
  shifts: Shift[];
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type StaffScheduleConflict = components["schemas"]["ScheduleConflictAppointment"];
export type ScheduleConflictDetails = {
  currentScheduleRevision?: number;
  conflictCount?: number;
  conflicts?: StaffScheduleConflict[];
  conflictsTruncated?: boolean;
  acknowledgementToken?: string;
};

export type CreateCategoryPayload = {
  translations: StaffCategoryTranslations;
  sortOrder: number;
  isActive: boolean;
};
export type UpdateCategoryPayload = components["schemas"]["ServiceCategoryUpdateRequest"];
export type CreateServicePayload = {
  translations: StaffServiceTranslations;
  category: string;
  priceType: PriceType;
  priceFrom?: number | null;
  priceTo?: number | null;
  durationMinutes: number;
  isFeatured: boolean;
  bookingEnabled: boolean;
  sortOrder: number;
  isActive: boolean;
};
export type UpdateServicePayload = components["schemas"]["ServiceUpdateRequest"];
export type CreateDentistPayload = {
  firstName: string;
  lastName: string;
  translations: StaffDentistTranslations;
  experienceYears: number;
  languages: DentistLanguage[];
  services: string[];
  weeklySchedule: DentistWorkingDay[];
  isFeatured: boolean;
  bookingEnabled: boolean;
  isActive: boolean;
  sortOrder: number;
};
export type UpdateDentistPayload = components["schemas"]["DentistUpdateRequest"];
export type UpdateClinicPayload = components["schemas"]["ClinicUpdateRequest"];
export type ScheduleExceptionPayload = {
  expectedScheduleRevision: number;
  scheduleConflictAcknowledgement?: string;
  isWorking: boolean;
  shifts: Shift[];
  note: string;
};
export type ClinicClosurePayload = {
  expectedScheduleRevision: number;
  scheduleConflictAcknowledgement?: string;
  isOpen: boolean;
  shifts: Shift[];
  note: string;
};

export const objectIdPattern = /^[0-9a-f]{24}$/i;
export const localDatePattern = /^\d{4}-\d{2}-\d{2}$/;
export const localTimePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const acknowledgementPattern = /^[0-9a-f]{64}$/i;
const locales = ["hy", "ru", "en"] as const;
const priceTypes = new Set<unknown>(["fixed", "from", "range", "on_request"]);
const languages = new Set<unknown>(["hy", "ru", "en", "fr", "de", "other"]);
const statuses = new Set<unknown>([
  "pending", "confirmed", "checked_in", "in_progress", "completed", "cancelled", "no_show",
]);

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

function protocol(): never {
  throw new Error("STAFF_MANAGEMENT_PROTOCOL_ERROR");
}

function string(value: unknown, max = 10_000) {
  if (typeof value !== "string" || value.length > max) protocol();
  return value;
}

function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) protocol();
  return value as number;
}

function finiteNumber(value: unknown, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) protocol();
  return value;
}

function boolean(value: unknown) {
  if (typeof value !== "boolean") protocol();
  return value;
}

function id(value: unknown) {
  const result = string(value, 24);
  if (!objectIdPattern.test(result)) protocol();
  return result;
}

function dateTime(value: unknown) {
  const result = string(value, 64);
  if (!Number.isFinite(Date.parse(result))) protocol();
  return result;
}

function copyTranslation<T extends readonly string[]>(value: unknown, fields: T) {
  if (!isRecord(value)) protocol();
  const result: Record<string, string | string[]> = {};
  for (const field of fields) {
    if (value[field] === undefined) continue;
    if (field === "specializations") {
      if (!Array.isArray(value[field]) || value[field].length > 20) protocol();
      result[field] = value[field].map((item) => string(item, 100));
    } else {
      result[field] = string(value[field], 5_000);
    }
  }
  return result;
}

function copyTranslations(value: unknown, fields: readonly string[]) {
  if (!isRecord(value)) protocol();
  const result: Record<string, unknown> = {};
  for (const locale of locales) {
    if (value[locale] !== undefined) result[locale] = copyTranslation(value[locale], fields);
  }
  return result;
}

function parseImage(value: unknown) {
  if (value === null) return null;
  if (!isRecord(value)) protocol();
  return {
    publicId: string(value.publicId, 500),
    secureUrl: string(value.secureUrl, 2_000),
    width: integer(value.width, 1, 20_000),
    height: integer(value.height, 1, 20_000),
    format: string(value.format, 32),
    bytes: integer(value.bytes, 1, 100_000_000),
  };
}

export function parseShift(value: unknown): Shift {
  if (!isRecord(value)) protocol();
  const start = string(value.start, 5);
  const end = string(value.end, 5);
  if (!localTimePattern.test(start) || !localTimePattern.test(end)) protocol();
  return { start, end };
}

function parseShifts(value: unknown) {
  if (!Array.isArray(value) || value.length > 6) protocol();
  return value.map(parseShift);
}

export function parseCategory(value: unknown): StaffCategory {
  if (!isRecord(value)) protocol();
  return {
    _id: id(value._id),
    name: string(value.name, 100),
    slug: string(value.slug, 120),
    description: string(value.description, 500),
    translations: copyTranslations(value.translations, ["name", "description"]),
    imageUrl: string(value.imageUrl, 2_000),
    sortOrder: integer(value.sortOrder, 0, 10_000),
    isActive: boolean(value.isActive),
    createdAt: dateTime(value.createdAt),
    updatedAt: dateTime(value.updatedAt),
  } as StaffCategory;
}

function parseCategorySummary(value: unknown) {
  if (!isRecord(value)) protocol();
  return {
    _id: id(value._id),
    name: string(value.name, 100),
    slug: string(value.slug, 120),
    translations: copyTranslations(value.translations, ["name", "description"]),
  };
}

export function parseService(value: unknown): StaffService {
  if (!isRecord(value) || !priceTypes.has(value.priceType)) protocol();
  const nullablePrice = (price: unknown) => price === null ? null : finiteNumber(price, 0, Number.MAX_SAFE_INTEGER);
  return {
    _id: id(value._id),
    name: string(value.name, 150),
    slug: string(value.slug, 180),
    category: parseCategorySummary(value.category),
    shortDescription: string(value.shortDescription, 300),
    description: string(value.description, 5_000),
    translations: copyTranslations(value.translations, ["name", "shortDescription", "description"]),
    priceType: value.priceType as PriceType,
    priceFrom: nullablePrice(value.priceFrom),
    priceTo: nullablePrice(value.priceTo),
    currency: value.currency === "AMD" ? "AMD" : protocol(),
    durationMinutes: integer(value.durationMinutes, 15, 480),
    imageUrl: string(value.imageUrl, 2_000),
    image: parseImage(value.image),
    isFeatured: boolean(value.isFeatured),
    bookingEnabled: boolean(value.bookingEnabled),
    isActive: boolean(value.isActive),
    sortOrder: integer(value.sortOrder, 0, 10_000),
    createdAt: dateTime(value.createdAt),
    updatedAt: dateTime(value.updatedAt),
  };
}

function parseDentistService(value: unknown): StaffDentistService {
  if (!isRecord(value)) protocol();
  return {
    _id: id(value._id),
    name: string(value.name, 150),
    slug: string(value.slug, 180),
    translations: copyTranslations(value.translations, ["name", "shortDescription", "description"]),
    isActive: boolean(value.isActive),
    bookingEnabled: boolean(value.bookingEnabled),
  } as StaffDentistService;
}

export function parseDentist(value: unknown): StaffDentist {
  if (!isRecord(value) || !Array.isArray(value.services) || !Array.isArray(value.languages) ||
      !Array.isArray(value.specializations) || !Array.isArray(value.weeklySchedule)) protocol();
  if (value.services.length > 100 || value.languages.length > 6 || value.specializations.length > 20 ||
      value.weeklySchedule.length > 7 || value.languages.some((item) => !languages.has(item))) protocol();
  return {
    _id: id(value._id),
    firstName: string(value.firstName, 80),
    lastName: string(value.lastName, 80),
    slug: string(value.slug, 180),
    title: string(value.title, 150),
    specializations: value.specializations.map((item) => string(item, 100)),
    bio: string(value.bio, 5_000),
    translations: copyTranslations(value.translations, ["title", "bio", "specializations"]),
    experienceYears: integer(value.experienceYears, 0, 70),
    photoUrl: string(value.photoUrl, 2_000),
    photo: parseImage(value.photo),
    languages: value.languages as DentistLanguage[],
    services: value.services.map(parseDentistService),
    weeklySchedule: value.weeklySchedule.map((day) => {
      if (!isRecord(day)) protocol();
      return {
        dayOfWeek: integer(day.dayOfWeek, 1, 7),
        isWorking: boolean(day.isWorking),
        shifts: parseShifts(day.shifts),
      };
    }),
    scheduleRevision: integer(value.scheduleRevision),
    isFeatured: boolean(value.isFeatured),
    bookingEnabled: boolean(value.bookingEnabled),
    isActive: boolean(value.isActive),
    sortOrder: integer(value.sortOrder, 0, 10_000),
    createdAt: dateTime(value.createdAt),
    updatedAt: dateTime(value.updatedAt),
  } as StaffDentist;
}

export function parseClinic(value: unknown): StaffClinic {
  if (!isRecord(value) || !isRecord(value.socialLinks) || !isRecord(value.bookingSettings) ||
      !Array.isArray(value.weeklySchedule)) protocol();
  const booking = value.bookingSettings;
  const interval = integer(booking.slotIntervalMinutes, 10, 60);
  if (![10, 15, 20, 30, 60].includes(interval)) protocol();
  return {
    _id: id(value._id), key: string(value.key, 50), clinicName: string(value.clinicName, 150),
    tagline: string(value.tagline, 250), description: string(value.description, 5_000),
    phone: string(value.phone, 30), secondaryPhone: string(value.secondaryPhone, 30),
    email: string(value.email, 254), address: string(value.address, 300),
    translations: copyTranslations(value.translations, ["clinicName", "tagline", "description", "address"]),
    mapUrl: string(value.mapUrl, 2_000),
    latitude: value.latitude === null ? null : finiteNumber(value.latitude, -90, 90),
    longitude: value.longitude === null ? null : finiteNumber(value.longitude, -180, 180),
    timezone: string(value.timezone, 100),
    socialLinks: {
      instagram: string(value.socialLinks.instagram, 2_000), facebook: string(value.socialLinks.facebook, 2_000),
      whatsapp: string(value.socialLinks.whatsapp, 2_000), telegram: string(value.socialLinks.telegram, 2_000),
    },
    weeklySchedule: value.weeklySchedule.map((day) => {
      if (!isRecord(day)) protocol();
      return { dayOfWeek: integer(day.dayOfWeek, 1, 7), isOpen: boolean(day.isOpen), shifts: parseShifts(day.shifts) };
    }),
    bookingSettings: {
      isBookingEnabled: boolean(booking.isBookingEnabled),
      slotIntervalMinutes: interval as StaffBookingSettings["slotIntervalMinutes"],
      minBookingNoticeMinutes: integer(booking.minBookingNoticeMinutes, 0, 10_080),
      maxBookingDaysAhead: integer(booking.maxBookingDaysAhead, 1, 365),
      bufferMinutes: integer(booking.bufferMinutes, 0, 120),
      allowSameDayBooking: boolean(booking.allowSameDayBooking), requireEmail: boolean(booking.requireEmail),
      autoConfirmAppointments: boolean(booking.autoConfirmAppointments),
      maxAppointmentsPerPhonePerDay: integer(booking.maxAppointmentsPerPhonePerDay, 1, 20),
    },
    scheduleRevision: integer(value.scheduleRevision), createdAt: dateTime(value.createdAt), updatedAt: dateTime(value.updatedAt),
  } as StaffClinic;
}

function parseScheduleRecord(value: unknown, kind: "dentist" | "clinic") {
  if (!isRecord(value)) protocol();
  const date = string(value.date, 10);
  if (!localDatePattern.test(date)) protocol();
  return {
    _id: id(value._id),
    ...(kind === "dentist" ? { dentist: id(value.dentist) } : {}),
    date,
    [kind === "dentist" ? "isWorking" : "isOpen"]: boolean(
      value[kind === "dentist" ? "isWorking" : "isOpen"],
    ),
    shifts: parseShifts(value.shifts), note: string(value.note, 300),
    createdAt: dateTime(value.createdAt), updatedAt: dateTime(value.updatedAt),
  };
}

export function parseScheduleException(value: unknown): StaffScheduleException {
  return parseScheduleRecord(value, "dentist") as StaffScheduleException;
}

export function parseClinicClosure(value: unknown): StaffClinicClosure {
  return parseScheduleRecord(value, "clinic") as StaffClinicClosure;
}

export function parseScheduleConflictDetails(value: unknown): ScheduleConflictDetails {
  if (!isRecord(value)) return {};
  const result: ScheduleConflictDetails = {};
  if (value.currentScheduleRevision !== undefined) {
    result.currentScheduleRevision = integer(value.currentScheduleRevision);
  }
  if (value.conflictCount !== undefined) result.conflictCount = integer(value.conflictCount, 1, 10_000);
  if (value.conflictsTruncated !== undefined) result.conflictsTruncated = boolean(value.conflictsTruncated);
  if (value.acknowledgementToken !== undefined) {
    const token = string(value.acknowledgementToken, 64);
    if (!acknowledgementPattern.test(token)) protocol();
    result.acknowledgementToken = token;
  }
  if (value.conflicts !== undefined) {
    if (!Array.isArray(value.conflicts) || value.conflicts.length > 25) protocol();
    result.conflicts = value.conflicts.map((conflict) => {
      if (!isRecord(conflict)) protocol();
      const date = string(conflict.date, 10);
      const startTime = string(conflict.startTime, 5);
      const endTime = string(conflict.endTime, 5);
      if (!localDatePattern.test(date) || !localTimePattern.test(startTime) || !localTimePattern.test(endTime) ||
          !statuses.has(conflict.status)) protocol();
      return {
        appointmentId: id(conflict.appointmentId), date, startTime, endTime,
        dentistId: id(conflict.dentistId),
        status: conflict.status as StaffScheduleConflict["status"],
      };
    });
  }
  return result;
}
