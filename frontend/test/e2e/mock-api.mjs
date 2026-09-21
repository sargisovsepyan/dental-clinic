import http from "node:http";
import { randomUUID } from "node:crypto";
import { buildArelisContent } from '../preview/arelis-content.mjs';

import { isHumanName, canonicalPhone, isEmail, isBookingDate } from '../../../shared/booking-input.mjs';

const timestamp = "2026-01-01T00:00:00.000Z";
const image = (name) => ({
  publicId: `tests/${name}`,
  secureUrl: "/og.png",
  width: 1200,
  height: 800,
  format: "png",
  bytes: 1000,
});

const category = {
  _id: "64b000000000000000000001",
  name: "Թերապևտիկ ստոմատոլոգիա",
  slug: "therapy",
  description: "",
  translations: {
    hy: { name: "Թերապևտիկ ստոմատոլոգիա", description: "Հրապարակված թեստային կատեգորիա" },
    ru: { name: "Терапевтическая стоматология", description: "Опубликованная тестовая категория" },
    en: { name: "Therapeutic dentistry", description: "Published test category" },
  },
  imageUrl: "",
  sortOrder: 1,
  isActive: true,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const service = {
  _id: "64b000000000000000000011",
  name: "Ատամների մաքրում",
  slug: "test-cleaning",
  category: { _id: category._id, name: category.name, slug: category.slug, translations: category.translations },
  shortDescription: "",
  description: "",
  translations: {
    hy: {
      name: "Ատամների մաքրում",
      shortDescription: "Հրապարակված թեստային ծառայություն",
      description: '<img src=x onerror="alert(1)"> ցուցադրվում է որպես սովորական տեքստ։',
    },
    ru: { name: "Чистка зубов", shortDescription: "Опубликованная тестовая услуга", description: "Описание услуги" },
    en: { name: "Tooth cleaning", shortDescription: "Published test service", description: '<img src=x onerror="alert(1)"> remains escaped plain text.' },
  },
  priceType: "from",
  priceFrom: 20000,
  priceTo: null,
  currency: "AMD",
  durationMinutes: 60,
  imageUrl: "",
  image: image("service"),
  isFeatured: true,
  bookingEnabled: true,
  isActive: true,
  sortOrder: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const dentist = {
  _id: "64b000000000000000000021",
  firstName: "Անի",
  lastName: "Փորձարկում",
  slug: "ani-test",
  title: "",
  specializations: [],
  bio: "",
  translations: {
    hy: { firstName: "Անի", lastName: "Փորձարկում", title: "Ատամնաբույժ", bio: "Հրապարակված թեստային կենսագրություն", specializations: ["Թերապիա"] },
    ru: { firstName: "Ани", lastName: "Тест", title: "Стоматолог", bio: "Опубликованная тестовая биография", specializations: ["Терапия"] },
    en: { firstName: "Ani", lastName: "Test", title: "Dentist", bio: "Published test biography", specializations: ["Therapy"] },
  },
  experienceYears: 0,
  photoUrl: "",
  photo: image("dentist"),
  languages: ["hy", "ru", "en"],
  services: [{
    _id: service._id,
    name: service.name,
    slug: service.slug,
    translations: service.translations,
    shortDescription: service.shortDescription,
    durationMinutes: service.durationMinutes,
    priceType: service.priceType,
    priceFrom: service.priceFrom,
    priceTo: service.priceTo,
    currency: service.currency,
    isActive: true,
    bookingEnabled: true,
  }],
  weeklySchedule: [],
  scheduleRevision: 0,
  isFeatured: true,
  bookingEnabled: true,
  isActive: true,
  sortOrder: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const clinic = {
  _id: "64b000000000000000000031",
  key: "default",
  clinicName: "Փորձնական կլինիկա",
  tagline: "",
  description: "",
  phone: "+374 10 123456",
  secondaryPhone: "",
  email: "clinic@example.test",
  address: "",
  translations: {
    hy: { clinicName: "Փորձնական կլինիկա", tagline: "Հանգիստ և հստակ տեղեկատվություն", description: "Հրապարակված թեստային կլինիկայի նկարագրություն", address: "Երևան" },
    ru: { clinicName: "Тестовая клиника", tagline: "Спокойная и ясная информация", description: "Описание опубликованной тестовой клиники", address: "Ереван" },
    en: { clinicName: "Test clinic", description: "Published test clinic description", address: "Yerevan" },
  },
  mapUrl: "https://maps.example.test/clinic",
  latitude: null,
  longitude: null,
  timezone: "Asia/Yerevan",
  socialLinks: { instagram: "https://www.instagram.com/test", facebook: "", whatsapp: "", telegram: "" },
  weeklySchedule: Array.from({ length: 7 }, (_, index) => ({
    dayOfWeek: index + 1,
    isOpen: index < 6,
    shifts: index < 6 ? [{ start: "09:00", end: "18:00" }] : [],
  })),
  bookingSettings: {
    isBookingEnabled: true,
    slotIntervalMinutes: 30,
    minBookingNoticeMinutes: 120,
    maxBookingDaysAhead: 60,
    bufferMinutes: 0,
    allowSameDayBooking: true,
    requireEmail: false,
    autoConfirmAppointments: false,
    maxAppointmentsPerPhonePerDay: 3,
  },
  scheduleRevision: 0,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const galleryImage = {
  _id: "64b000000000000000000041",
  type: "clinic_gallery",
  image: image("gallery"),
  altText: "",
  caption: "",
  translations: {
    hy: { altText: "Փորձնական կլինիկայի լուսանկար", caption: "Հրապարակված թեստային պատկեր" },
    ru: { altText: "Фотография тестовой клиники", caption: "Опубликованное тестовое изображение" },
    en: { altText: "Test clinic photograph", caption: "Published test image" },
  },
  sortOrder: 1,
  isActive: true,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const beforeAfter = {
  _id: "64b000000000000000000051",
  title: "",
  description: "",
  translations: {
    hy: { title: "Փորձնական դեպք", description: "Հանրային ցուցադրման թեստային նկարագրություն" },
    ru: { title: "Тестовый случай", description: "Тестовое описание публичного показа" },
    en: { title: "Test case", description: "Test public-display description" },
  },
  service: { _id: service._id, name: service.name, slug: service.slug, translations: service.translations },
  dentist: { _id: dentist._id, firstName: dentist.firstName, lastName: dentist.lastName, slug: dentist.slug, title: dentist.title, translations: dentist.translations, photo: dentist.photo },
  beforeImage: image("before"),
  afterImage: image("after"),
  isFeatured: true,
  isActive: true,
  sortOrder: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const secondBeforeAfter = {
  ...beforeAfter,
  _id: "64b000000000000000000052",
  translations: {
    hy: { title: "Երկրորդ փորձնական դեպք", description: "Երկրորդ հանրային նկարագրություն" },
    ru: { title: "Второй тестовый случай", description: "Второе публичное описание" },
    en: { title: "Second test case", description: "Second public description" },
  },
  beforeImage: image("before-second"),
  afterImage: image("after-second"),
  isFeatured: false,
  sortOrder: 2,
};

export const previewPassword = "Preview123!";
export const previewAccounts = {
  admin: { id: "64b000000000000000000091", name: "Preview Admin", email: "admin@preview.local", role: "admin" },
  receptionist: { id: "64b000000000000000000092", name: "Preview Reception", email: "reception@preview.local", role: "receptionist" },
  dentist: { id: "64b000000000000000000093", name: "Preview Dentist", email: "dentist@preview.local", role: "dentist" },
  secondAdmin: { id: "64b000000000000000000094", name: "Second Admin", email: "second-admin@preview.local", role: "admin" },
};

function clinicDate(daysAhead) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: clinic.timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(Date.now() + daysAhead * 86_400_000));
  const value = (type) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function appointmentTimes(date, startTime, endTime) {
  return {
    startAt: new Date(`${date}T${startTime}:00+04:00`).toISOString(),
    endAt: new Date(`${date}T${endTime}:00+04:00`).toISOString(),
  };
}

function makeAppointment({
  id, code, status, date, startTime, endTime, patientName, patientPhone, patientEmail = "",
  mutationVersion = 0,
}) {
  return {
    _id: id,
    confirmationCode: code,
    patientName,
    patientPhone,
    patientEmail,
    dentist: dentist._id,
    service: service._id,
    dentistSnapshot: {
      firstName: dentist.firstName, lastName: dentist.lastName,
      title: dentist.title, translations: dentist.translations,
    },
    serviceSnapshot: {
      name: service.name, durationMinutes: service.durationMinutes, translations: service.translations,
    },
    priceSnapshot: {
      priceType: service.priceType, priceFrom: service.priceFrom,
      priceTo: service.priceTo, currency: service.currency,
    },
    date,
    startTime,
    endTime,
    ...appointmentTimes(date, startTime, endTime),
    bufferMinutes: 0,
    mutationVersion,
    scheduleRevision: dentist.scheduleRevision,
    notificationLocale: "hy",
    rescheduleHistory: [],
    status,
    source: "phone",
    patientComment: "Preview-only patient comment",
    internalNote: "Preview-only front desk note",
    privacyConsentAt: timestamp,
    privacyConsentMethod: "phone",
    privacyPolicyVersion: "preview-v1",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function initialAppointments() {
  const activeDate = clinicDate(5);
  return [
    makeAppointment({
      id: "64b000000000000000000071", code: "DC-PREVIEW00000001", status: "pending",
      date: activeDate, startTime: "09:00", endTime: "10:00",
      patientName: "Aram Preview", patientPhone: "+374 99 000001", patientEmail: "aram@preview.local",
    }),
    makeAppointment({
      id: "64b000000000000000000072", code: "DC-PREVIEW00000002", status: "confirmed",
      date: activeDate, startTime: "10:30", endTime: "11:30", mutationVersion: 2,
      patientName: "Mariam Preview", patientPhone: "+374 99 000002", patientEmail: "mariam@preview.local",
    }),
    makeAppointment({
      id: "64b000000000000000000073", code: "DC-PREVIEW00000003", status: "cancelled",
      date: clinicDate(6), startTime: "14:30", endTime: "15:30", mutationVersion: 1,
      patientName: "Narek Preview", patientPhone: "+374 99 000003",
    }),
  ];
}

function parseCookie(request, name) {
  const cookies = String(request.headers.cookie || "").split(";");
  for (const cookie of cookies) {
    const [key, ...parts] = cookie.trim().split("=");
    if (key === name) return decodeURIComponent(parts.join("="));
  }
  return null;
}

function send(response, status, body, headers = {}) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "x-request-id": randomUUID(),
    "cache-control": "no-store",
    "access-control-expose-headers": "Retry-After, X-Request-Id",
    ...(response.previewCorsOrigin ? {
      "access-control-allow-origin": response.previewCorsOrigin,
      "access-control-allow-credentials": "true",
      vary: "Origin",
    } : {}),
    ...headers,
  });
  response.end(JSON.stringify(body));
}

const allowedScenarios = [
  "success",
  "pending",
  "confirmed",
  "conflict",
  "empty-availability",
  "validation",
  "rate-limit",
  "error",
  "empty",
  "catalog-error",
  "staff-conflict",
  "staff-stale-availability",
  "staff-expired",
  "staff-invite-uncertain",
  "staff-last-admin-conflict",
  "governance-forbidden",
  "management-schedule-conflict",
  "management-schedule-stale",
  "media-conflict",
  "media-replacement-failure",
  "media-pair-failure",
  "media-unsupported",
  "media-rate-limit",
];

function readJson(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 110_000) reject(new Error("Request body too large"));
    });
    request.on("end", () => {
      try { resolve(JSON.parse(raw || "{}")); } catch (error) { reject(error); }
    });
    request.on("error", reject);
  });
}

function readMultipart(request) {
  return new Promise((resolve, reject) => {
    const contentType = String(request.headers["content-type"] || "");
    const boundaryMatch = contentType.match(/^multipart\/form-data;\s*boundary=(?:"([^"]+)"|([^;]+))$/i);
    if (!boundaryMatch) return reject(new Error("Invalid multipart boundary"));
    const boundary = boundaryMatch[1] || boundaryMatch[2];
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > 12 * 1024 * 1024) {
        reject(new Error("Request body too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      const parts = Buffer.concat(chunks).toString("latin1").split(`--${boundary}`);
      const fields = {};
      const files = {};
      for (const rawPart of parts) {
        const part = rawPart.replace(/^\r\n/, "").replace(/\r\n$/, "");
        if (!part || part === "--") continue;
        const separator = part.indexOf("\r\n\r\n");
        if (separator < 0) continue;
        const headers = part.slice(0, separator);
        const content = part.slice(separator + 4).replace(/\r\n--$/, "").replace(/\r\n$/, "");
        const disposition = headers.match(/content-disposition:\s*form-data;\s*name="([^"]+)"(?:;\s*filename="([^"]*)")?/i);
        if (!disposition) continue;
        const contentBuffer = Buffer.from(content, "latin1");
        if (disposition[2] !== undefined) {
          const mediaType = headers.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim().toLowerCase() || "";
          files[disposition[1]] = { filename: disposition[2], mediaType, size: contentBuffer.length };
        } else {
          fields[disposition[1]] = contentBuffer.toString("utf8");
        }
      }
      resolve({ fields, files });
    });
    request.on("error", reject);
  });
}

function parseMultipartJson(value, fallback = {}) {
  try { return JSON.parse(value || "{}"); } catch { return fallback; }
}

const testFixtures = { category, service, dentist, clinic, galleryImage, beforeAfter, secondBeforeAfter,
  previewAccounts, makeAppointment, initialAppointments };
const idForPreview = (number) => `66a${number.toString(16).padStart(21, '0')}`;

export function createMockApiServer(port = 5100, initialScenario = "success", options = {}) {
  const now = options.now ?? (() => new Date());
  const clock = () => new Date(now());
  const stamp = () => clock().toISOString();
  const timestamp = new Date(clock().getTime() - 7 * 86_400_000).toISOString();
  const clinicDate = (daysAhead = 0) => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Yerevan', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(clock());
    const part = (type) => parts.find((item) => item.type === type).value;
    const date = new Date(`${part('year')}-${part('month')}-${part('day')}T12:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + daysAhead);
    return date.toISOString().slice(0, 10);
  };
  const content = options.profile === 'arelis' ? buildArelisContent(testFixtures.previewAccounts) : null;
  const category = content?.categories[0] ?? testFixtures.category;
  const service = content?.services[2] ?? testFixtures.service;
  const dentist = content?.dentists[3] ?? testFixtures.dentist;
  const clinic = content?.clinic ?? testFixtures.clinic;
  const galleryImage = content?.gallery[0] ?? testFixtures.galleryImage;
  const beforeAfter = content?.cases[0] ?? testFixtures.beforeAfter;
  const secondBeforeAfter = content?.cases[1] ?? testFixtures.secondBeforeAfter;
  const previewAccounts = content?.staff ?? testFixtures.previewAccounts;
  const makeAppointment = (values) => {
    const row = { ...testFixtures.makeAppointment(values), createdAt: stamp(), updatedAt: stamp(), privacyAcceptedAt: stamp() };
    if (!content) return row;
    const selectedDoctor = managedDentists.find((item) => item._id === values.dentistId) ?? content.dentists.find((item) => item._id === values.dentistId) ?? dentist;
    const selectedService = managedServices.find((item) => item._id === values.serviceId) ?? content.services.find((item) => item._id === values.serviceId) ?? service;
    return { ...row, dentist: selectedDoctor._id, service: selectedService._id,
      dentistSnapshot: { firstName: selectedDoctor.firstName, lastName: selectedDoctor.lastName,
        title: selectedDoctor.title, translations: selectedDoctor.translations },
      serviceSnapshot: { name: selectedService.name, durationMinutes: selectedService.durationMinutes,
        translations: selectedService.translations },
      priceSnapshot: { priceType: selectedService.priceType, priceFrom: selectedService.priceFrom, priceTo: null, currency: 'AMD' },
      patientEmail: '', patientComment: '', internalNote: '', privacyPolicyVersion: '2026-09',
    };
  };
  const workingDate = (ahead) => {
    const date = clinicDate(ahead);
    return new Date(`${date}T12:00:00+04:00`).getUTCDay() === 0 ? clinicDate(ahead + 1) : date;
  };
  const initialAppointments = () => !content ? testFixtures.initialAppointments().map((item, index) => ({ ...item, date: clinicDate(5 + index), ...appointmentTimes(clinicDate(5 + index), item.startTime, item.endTime), createdAt: timestamp, updatedAt: timestamp })) : [
    makeAppointment({ id: idForPreview(701), code: 'DC-1234567890ABCDEF', status: 'confirmed', date: workingDate(0), startTime: '09:00', endTime: '10:00', patientName: 'Alex Martin', patientPhone: '+37499000001' }),
    makeAppointment({ id: idForPreview(702), code: 'DC-1234567890ABCDE0', status: 'confirmed', date: workingDate(2), startTime: '10:30', endTime: '11:30', patientName: 'Sofia David', patientPhone: '+37499000002' }),
    makeAppointment({ id: idForPreview(703), code: 'DC-1234567890ABCDE1', status: 'confirmed', date: workingDate(4), startTime: '14:30', endTime: '15:15', patientName: 'Levon Adam', patientPhone: '+37499000003', dentistId: content.dentists[1]._id, serviceId: content.services[8]._id }),
  ];
  let scenario = allowedScenarios.includes(initialScenario) ? initialScenario : "success";
  let conflictReturned = false;
  let staffConflictReturned = false;
  let managementConflictReturned = false;
  let appointments = [];
  let managedCategories = [];
  let managedServices = [];
  let managedDentists = [];
  let managedClinic = null;
  let managedGallery = [];
  let managedBeforeAfter = [];
  let mediaCleanupJobs = [];
  let mediaSequence = 0;
  let scheduleExceptions = [];
  let clinicClosures = [];
  let managedStaff = [];
  let previewInvitations = [];
  const previewPasswords = new Map();
  let auditHistory = [];
  let governanceSequence = 0;
  const idempotentResults = new Map();
  const refreshSessions = new Map();
  const accessSessions = new Map();
  const frontendOrigin = `http://127.0.0.1:${port - 2_000}`;

  const issueAccessToken = (user) => {
    const token = `preview-access-${user.role}-${randomUUID()}`;
    accessSessions.set(token, user);
    return token;
  };
  const issueRefreshCookie = (response, user, previousSession) => {
    if (previousSession) refreshSessions.delete(previousSession);
    const session = randomUUID();
    refreshSessions.set(session, user);
    response.setHeader("set-cookie", `preview_refresh=${encodeURIComponent(session)}; HttpOnly; SameSite=Strict; Path=/api/v1/auth`);
  };
  const authenticatedUser = (request) => {
    if (scenario === "staff-expired") return null;
    const authorization = String(request.headers.authorization || "");
    const session = authorization.startsWith("Bearer ") ? accessSessions.get(authorization.slice(7)) : null;
    const current = session && managedStaff.find((member) => member._id === session.id && member.isActive && member.isSetupComplete);
    return current ? { id: current._id, name: current.name, email: current.email, role: current.role,
      ...(current.nameTranslations ? { nameTranslations: current.nameTranslations } : {}) } : null;
  };
  const safeMember = (member) => ({
    _id: member._id,
    name: member.name,
    ...(member.nameTranslations ? { nameTranslations: member.nameTranslations } : {}),
    email: member.email,
    role: member.role,
    dentistProfile: member.dentistProfile ?? null,
    isActive: member.isActive,
    isSetupComplete: member.isSetupComplete,
    invitedBy: member.invitedBy ?? null,
    deactivatedAt: member.deactivatedAt ?? null,
    deactivatedBy: member.deactivatedBy ?? null,
    createdAt: member.createdAt,
    updatedAt: member.updatedAt,
  });
  const invitationContext = (member) => {
    const linkedDentist = member.dentistProfile
      ? managedDentists.find((item) => item._id === member.dentistProfile) : null;
    return {
      name: member.name,
      ...(member.nameTranslations ? { nameTranslations: member.nameTranslations } : {}),
      email: member.email,
      role: member.role,
      ...(linkedDentist ? { dentist: {
        _id: linkedDentist._id,
        firstName: linkedDentist.firstName,
        lastName: linkedDentist.lastName,
        translations: linkedDentist.translations,
      } } : {}),
    };
  };
  const endTimeFor = (start, serviceId) => {
    const [hours, minutes] = start.split(":").map(Number);
    const end = hours * 60 + minutes + (managedServices.find((item) => item._id === serviceId) ?? service).durationMinutes;
    return `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
  };
  const cleanDateAllowed = (date) => isBookingDate(date, { min: clinicDate(managedClinic.bookingSettings.allowSameDayBooking ? 0 : 1), max: clinicDate(managedClinic.bookingSettings.maxBookingDaysAhead) });
  const validPatient = (body) => body && isHumanName(body.patientName) && canonicalPhone(body.patientPhone) &&
    isEmail(body.patientEmail ?? '', managedClinic.bookingSettings.requireEmail) && typeof (body.patientComment ?? '') === 'string' &&
    (body.patientComment ?? '').length <= 1000 && body.privacyAccepted === true && cleanDateAllowed(body.date) &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(body.startTime);
  const cleanRelationship = (dentistId, serviceId) => {
    const doctor = managedDentists.find((item) => item._id === dentistId && item.isActive && item.bookingEnabled);
    const selected = managedServices.find((item) => item._id === serviceId && item.isActive && item.bookingEnabled);
    return doctor && selected && managedCategories.some((item) => item._id === selected.category._id && item.isActive) && doctor.services.some((item) => item._id === serviceId) ? { doctor, selected } : null;
  };
  const cleanSlotAvailable = (date, start, end, dentistId, excludeId) => {
    const parsed = new Date(`${date}T12:00:00+04:00`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return false;
    const day = parsed.getUTCDay() || 7;
    if (!cleanDateAllowed(date) || !managedClinic.bookingSettings.isBookingEnabled || !/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || start >= end) return false;
    if (new Date(`${date}T${start}:00+04:00`).getTime() < clock().getTime() + managedClinic.bookingSettings.minBookingNoticeMinutes * 60_000) return false;
    const clinicDay = clinicClosures.find((item) => item.date === date) ?? managedClinic.weeklySchedule.find((item) => item.dayOfWeek === day);
    const doctorDay = scheduleExceptions.find((item) => item.dentist === dentistId && item.date === date) ?? managedDentists.find((item) => item._id === dentistId)?.weeklySchedule.find((item) => item.dayOfWeek === day);
    const fits = (shifts) => shifts?.some((shift) => start >= shift.start && end <= shift.end);
    return Boolean(clinicDay?.isOpen && doctorDay?.isWorking && fits(clinicDay.shifts) && fits(doctorDay.shifts) &&
      !appointments.some((item) => item._id !== excludeId && item.dentist === dentistId && item.date === date && item.status !== 'cancelled' && item.startTime < end && item.endTime > start));
  };
  const versionConflict = (response, appointment) => send(response, 409, {
    success: false,
    code: "APPOINTMENT_VERSION_CONFLICT",
    message: "Synthetic stale appointment version",
    details: { currentMutationVersion: appointment.mutationVersion },
  });
  const resetManagement = () => {
    governanceSequence = 0;
    managedStaff = Object.values(previewAccounts).map((account) => ({
      _id: account.id, name: account.name, email: account.email, role: account.role,
      ...(account.nameTranslations ? { nameTranslations: account.nameTranslations } : {}),
      dentistProfile: account.dentistProfile ?? (account.role === 'dentist' ? dentist._id : null),
      isActive: true, isSetupComplete: true, invitedBy: null, deactivatedAt: null, deactivatedBy: null,
      createdAt: timestamp, updatedAt: timestamp,
    }));
    managedStaff.push(
      { _id: "64b000000000000000000095", name: "Established Inactive", email: "inactive@preview.local", role: "receptionist", dentistProfile: null, isActive: false, isSetupComplete: true, invitedBy: null, deactivatedAt: timestamp, deactivatedBy: previewAccounts.admin.id, createdAt: timestamp, updatedAt: timestamp },
      { _id: "64b000000000000000000096", name: "Pending Setup", email: "pending@preview.local", role: "receptionist", dentistProfile: null, isActive: false, isSetupComplete: false, invitedBy: previewAccounts.admin.id, deactivatedAt: null, deactivatedBy: null, createdAt: timestamp, updatedAt: timestamp },
    );
    auditHistory = Array.from({ length: 36 }, (_, index) => ({
      _id: (0x1000 + index).toString(16).padStart(24, "0"), requestId: `preview-audit-${index + 1}`,
      actor: index % 6 === 0 ? null : { _id: previewAccounts.admin.id, name: previewAccounts.admin.name, email: previewAccounts.admin.email, role: "admin" },
      action: index % 3 === 0 ? "future.unknown" : index % 3 === 1 ? "staff.invited" : "staff.sessions.revoked",
      entityType: index % 3 === 0 ? "future-entity" : "user", entityId: managedStaff[index % managedStaff.length]._id,
      method: "POST", path: "/staff/action", metadata: { outcome: "confirmed", nested: { safeReason: "<img src=x onerror=alert(1)> is plain text", values: [true, 2, null] } },
      createdAt: `2026-09-15T${String(8 + Math.floor(index / 12)).padStart(2, "0")}:00:00.000Z`,
    }));
    if (content) managedStaff = managedStaff.filter((item) => item.isActive);
    previewInvitations = [];
    previewPasswords.clear();
    if (content) auditHistory = [];
    managedCategories = structuredClone(content?.categories ?? [category]);
    managedServices = structuredClone(content?.services ?? [service]);
    managedDentists = structuredClone(content?.dentists ?? [dentist]);
    managedClinic = structuredClone(clinic);
    scheduleExceptions = [];
    clinicClosures = [];
    managedGallery = structuredClone(content?.gallery ?? [galleryImage]);
    managedBeforeAfter = (content?.cases ?? [beforeAfter, secondBeforeAfter]).map((item) => ({
      ...structuredClone(item),
      publicationStatus: "published",
      consentStatus: "active",
      consentPolicyVersion: content ? "2026-09" : "preview-2026-01",
      consentMethod: "written",
      consentConfirmedAt: timestamp,
      consentRecordedBy: previewAccounts.admin.id,
      externalConsentReference: "",
      withdrawnAt: null,
      withdrawnBy: null,
      withdrawalReason: "",
      purgedAt: null,
      purgedBy: null,
      consentHistory: [{
        action: "confirmed", policyVersion: content ? "2026-09" : "preview-2026-01", method: "written",
        actor: previewAccounts.admin.id, occurredAt: timestamp, reason: "",
      }],
      createdBy: previewAccounts.admin,
    }));
    mediaCleanupJobs = [{
      _id: "64b000000000000000000061",
      publicId: "tests/orphan-preview",
      reason: "replacement",
      sourceType: "dentist",
      sourceId: dentist._id,
      status: "failed",
      attempts: 3,
      maxAttempts: 5,
      nextAttemptAt: timestamp,
      lockedAt: null,
      lockedBy: "",
      lastErrorCode: "provider_unavailable",
      completedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }];
    if (content) mediaCleanupJobs = [];
    mediaSequence = 0;
    managementConflictReturned = false;
  };
  resetManagement();
  appointments = initialAppointments();
  const scheduleAcknowledgement = "a".repeat(64);
  const categorySummary = (value) => ({
    _id: value._id,
    name: value.name,
    slug: value.slug,
    translations: value.translations,
  });
  const serviceSummary = (value) => ({
    _id: value._id,
    name: value.name,
    slug: value.slug,
    translations: value.translations,
    isActive: value.isActive,
    bookingEnabled: value.bookingEnabled,
  });
  const nextMediaId = () => `65c${(++mediaSequence).toString(16).padStart(21, "0")}`;
  const publicBeforeAfter = (item) => ({
    _id: item._id,
    title: item.title,
    description: item.description,
    translations: item.translations,
    service: item.service,
    dentist: item.dentist,
    beforeImage: item.beforeImage,
    afterImage: item.afterImage,
    isFeatured: item.isFeatured,
    isActive: item.isActive,
    sortOrder: item.sortOrder,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  });
  const scheduleRevisionConflict = (response, currentScheduleRevision) => send(response, 409, {
    success: false,
    code: "SCHEDULE_REVISION_CONFLICT",
    message: "Synthetic stale schedule revision",
    details: { currentScheduleRevision },
  });
  const scheduleImpactConflict = (response, currentScheduleRevision) => {
    const appointment = appointments.find((item) => item.status !== "cancelled");
    return send(response, 409, {
      success: false,
      code: "SCHEDULE_CONFLICT_ACKNOWLEDGEMENT_REQUIRED",
      message: "Synthetic appointment impact requires acknowledgement",
      details: {
        currentScheduleRevision,
        conflictCount: 1,
        conflictsTruncated: false,
        acknowledgementToken: scheduleAcknowledgement,
        conflicts: [{
          appointmentId: appointment._id,
          date: appointment.date,
          startTime: appointment.startTime,
          endTime: appointment.endTime,
          dentistId: appointment.dentist,
          status: appointment.status,
        }],
      },
    });
  };
  const rejectScheduleMutation = ({ response, expectedRevision, acknowledgement, currentRevision, bumpRevision }) => {
    if (expectedRevision !== currentRevision) {
      scheduleRevisionConflict(response, currentRevision);
      return true;
    }
    if (scenario === "management-schedule-stale" && !managementConflictReturned) {
      managementConflictReturned = true;
      scheduleRevisionConflict(response, bumpRevision());
      return true;
    }
    if (scenario === "management-schedule-conflict" && acknowledgement !== scheduleAcknowledgement) {
      scheduleImpactConflict(response, currentRevision);
      return true;
    }
    return false;
  };

  return http.createServer(async (request, response) => {
    const url = new URL(request.url || "/", `http://127.0.0.1:${port}`);
    const origin = String(request.headers.origin || "");
    if (origin === frontendOrigin) response.previewCorsOrigin = origin;
    if (request.method === "OPTIONS") {
      if (origin !== frontendOrigin) return send(response, 403, { success: false, message: "Origin not allowed" });
      response.writeHead(204, {
        "access-control-allow-origin": frontendOrigin,
        "access-control-allow-credentials": "true",
        "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "access-control-allow-headers": "Authorization, Content-Type, Idempotency-Key",
        "access-control-max-age": "600",
        vary: "Origin",
      });
      return response.end();
    }
    if (url.pathname.startsWith("/__test__/scenario/")) {
      const requested = url.pathname.split("/").at(-1);
      if (!allowedScenarios.includes(requested)) {
        return send(response, 400, { success: false, message: "Unknown deterministic test scenario" });
      }
      scenario = requested;
      conflictReturned = false;
      staffConflictReturned = false;
      resetManagement();
      appointments = initialAppointments();
      idempotentResults.clear();
      if (requested === "success") {
        refreshSessions.clear();
        accessSessions.clear();
      }
      return send(response, 200, { success: true, data: { scenario } });
    }
    if (request.method === "POST" && url.pathname === "/api/v1/auth/login") {
      let body;
      try { body = await readJson(request); } catch { return send(response, 400, { success: false, code: "VALIDATION_ERROR" }); }
      if (!body || !isEmail(body.email, true)) return send(response, 400, { success: false, code: "VALIDATION_ERROR" });
      const normalizedEmail = String(body.email || "").trim().toLowerCase();
      const member = managedStaff.find((item) => item.email === normalizedEmail && item.isActive && item.isSetupComplete);
      const user = member ? { id: member._id, name: member.name, email: member.email, role: member.role,
        ...(member.nameTranslations ? { nameTranslations: member.nameTranslations } : {}) } : null;
      const expectedPassword = member ? (previewPasswords.get(member._id) ?? previewPassword) : null;
      if (!user || body.password !== expectedPassword) {
        return send(response, 401, { success: false, code: "INVALID_CREDENTIALS", message: "Invalid credentials" });
      }
      issueRefreshCookie(response, user);
      return send(response, 200, { success: true, data: { accessToken: issueAccessToken(user), user } });
    }
    if (request.method === "POST" && url.pathname === "/api/v1/auth/refresh") {
      const session = parseCookie(request, "preview_refresh");
      const user = session ? refreshSessions.get(session) : null;
      if (!user || scenario === "staff-expired") {
        if (session) refreshSessions.delete(session);
        response.setHeader("set-cookie", "preview_refresh=; HttpOnly; SameSite=Strict; Path=/api/v1/auth; Max-Age=0");
        return send(response, 401, { success: false, code: "INVALID_REFRESH_TOKEN", message: "Session expired" });
      }
      issueRefreshCookie(response, user, session);
      return send(response, 200, { success: true, data: { accessToken: issueAccessToken(user), user } });
    }
    if (request.method === "POST" && url.pathname === "/api/v1/auth/logout") {
      const session = parseCookie(request, "preview_refresh");
      if (session) refreshSessions.delete(session);
      response.setHeader("set-cookie", "preview_refresh=; HttpOnly; SameSite=Strict; Path=/api/v1/auth; Max-Age=0");
      return send(response, 200, { success: true, message: "Logged out" });
    }
    if (request.method === "POST" && url.pathname === "/api/v1/auth/forgot-password") {
      const body = await readJson(request).catch(() => null);
      if (!body || !isEmail(body.email, true)) return send(response, 400, { success: false, code: "VALIDATION_ERROR" });
      return send(response, 202, { success: true, message: "If eligible, instructions were sent" });
    }
    if (request.method === "POST" && url.pathname === "/api/v1/auth/invitation-context") {
      const body = await readJson(request).catch(() => ({}));
      if (body.token !== "preview-setup-token-000000000000000000000000") {
        return send(response, 400, { success: false, code: "INVALID_TOKEN", message: "Invalid token" });
      }
      return send(response, 200, { success: true, data: { invitation: {
        name: "Preview Employee",
        email: "employee@preview.local",
        role: "receptionist",
      } } });
    }
    if (request.method === "POST" && (url.pathname === "/api/v1/auth/reset-password" || url.pathname === "/api/v1/auth/setup-password")) {
      const body = await readJson(request).catch(() => ({}));
      const expectedToken = url.pathname.includes("setup") ? "preview-setup-token-000000000000000000000000" : "preview-reset-token-000000000000000000000000";
      if (body.token !== expectedToken || typeof body.password !== "string" ||
          [...body.password].length < 6 || Buffer.byteLength(body.password, "utf8") > 72) {
        return send(response, 400, { success: false, code: "INVALID_TOKEN", message: "Invalid token" });
      }
      return send(response, 200, { success: true, message: "Password saved" });
    }
    if (request.method === "GET" && url.pathname === "/api/v1/auth/me") {
      const user = authenticatedUser(request);
      return user
        ? send(response, 200, { success: true, data: { user } })
        : send(response, 401, { success: false, code: "UNAUTHORIZED", message: "Authentication required" });
    }
    if (request.method === "POST" && url.pathname === "/api/v1/auth/change-password") {
      const user = authenticatedUser(request);
      if (!user) return send(response, 401, { success: false, code: "UNAUTHORIZED", message: "Authentication required" });
      const body = await readJson(request).catch(() => ({}));
      if (body.currentPassword !== previewPassword || typeof body.newPassword !== "string" ||
          [...body.newPassword].length < 6 || Buffer.byteLength(body.newPassword, "utf8") > 72) {
        return send(response, 400, { success: false, code: "VALIDATION_ERROR", message: "Invalid password" });
      }
      for (const [key, value] of refreshSessions) if (value.id === user.id) refreshSessions.delete(key);
      for (const [key, value] of accessSessions) if (value.id === user.id) accessSessions.delete(key);
      response.setHeader("set-cookie", "preview_refresh=; HttpOnly; SameSite=Strict; Path=/api/v1/auth; Max-Age=0");
      return send(response, 200, { success: true, message: "Password changed" });
    }
    if (request.method === "GET" && url.pathname === "/api/v1/preview/invitations") {
      const user = authenticatedUser(request);
      if (!user) return send(response, 401, { success: false, code: "UNAUTHORIZED" });
      if (user.role !== "admin") return send(response, 403, { success: false, code: "FORBIDDEN" });
      return send(response, 200, { success: true, data: { invitations: previewInvitations.map((item) => ({
        id: item.id, recipient: item.recipient, name: item.name, role: item.role,
        createdAt: item.createdAt, status: item.status,
      })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) } });
    }
    const previewInvitationRoute = url.pathname.match(/^\/api\/v1\/preview\/invitations\/([a-f\d-]{36})(?:\/(setup))?$/iu);
    if (previewInvitationRoute) {
      const invitation = previewInvitations.find((item) => item.id === previewInvitationRoute[1]);
      const member = invitation && managedStaff.find((item) => item._id === invitation.memberId);
      if (!invitation || !member || !['pending', 'opened'].includes(invitation.status) || member.deactivatedAt || member.isSetupComplete) {
        return send(response, 400, { success: false, code: "INVALID_INVITATION" });
      }
      if (!previewInvitationRoute[2] && request.method === "GET") {
        invitation.status = 'opened';
        return send(response, 200, { success: true, data: { invitation: invitationContext(member) } });
      }
      if (previewInvitationRoute[2] === 'setup' && request.method === "POST") {
        const body = await readJson(request).catch(() => ({}));
        if (typeof body.password !== 'string' || [...body.password].length < 6 || Buffer.byteLength(body.password, 'utf8') > 72) {
          return send(response, 400, { success: false, code: "VALIDATION_ERROR" });
        }
        member.isSetupComplete = true; member.isActive = true; member.updatedAt = stamp();
        previewPasswords.set(member._id, body.password); invitation.status = 'activated';
        return send(response, 200, { success: true, message: "Account activated" });
      }
      return send(response, 405, { success: false });
    }
    const governanceStaffRoute = url.pathname.match(/^\/api\/v1\/staff\/([a-f\d]{24})(?:\/(role|deactivate|reactivate|revoke-sessions|resend-invitation|cancel-invitation|dentist-profile))?$/iu);
    if (url.pathname === "/api/v1/staff" || url.pathname === "/api/v1/staff/invite" || governanceStaffRoute || url.pathname === "/api/v1/audit-logs") {
      response.setHeader("cache-control", "no-store");
      const user = authenticatedUser(request);
      if (!user) return send(response, 401, { success: false, code: "UNAUTHORIZED" });
      if (user.role !== "admin" || scenario === "governance-forbidden") return send(response, 403, { success: false, code: "FORBIDDEN" });
      const page = Number(url.searchParams.get("page") || 1);
      const limit = Number(url.searchParams.get("limit") || 50);
      if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) return send(response, 400, { success: false });
      const paginated = (items, key) => send(response, 200, { success: true, data: { [key]: items.slice((page - 1) * limit, page * limit), pagination: { page, limit, total: items.length, pages: Math.ceil(items.length / limit) } } });
      const invalidate = (id) => {
        for (const [key, value] of refreshSessions) if (value.id === id) refreshSessions.delete(key);
        for (const [key, value] of accessSessions) if (value.id === id) accessSessions.delete(key);
      };
      const recordAudit = (action, member) => {
        auditHistory.push({ _id: (0x2000 + ++governanceSequence).toString(16).padStart(24, "0"), requestId: `preview-change-${governanceSequence}`, actor: { _id: user.id, name: user.name, email: user.email, role: user.role }, action, entityType: "user", entityId: member._id, method: request.method, path: url.pathname, metadata: { outcome: "confirmed" }, createdAt: stamp() });
      };
      if (governanceStaffRoute?.[2] === 'dentist-profile') {
        const member = managedStaff.find((item) => item._id === governanceStaffRoute[1]);
        if (!member) return send(response, 404, { success: false });
        if (request.method === 'GET') return send(response, 200, { success: true, data: { dentistId: member.dentistProfile ?? null } });
        if (request.method !== 'PUT' || member.role !== 'dentist') return send(response, 409, { success: false });
        const body = await readJson(request).catch(() => null);
        if (!body || Object.keys(body).join(',') !== 'dentistId' || !managedDentists.some((item) => item._id === body.dentistId)) return send(response, 400, { success: false });
        if (managedStaff.some((item) => item._id !== member._id && !item.deactivatedAt && item.dentistProfile === body.dentistId)) return send(response, 409, { success: false });
        member.dentistProfile = body.dentistId; member.updatedAt = stamp();
        invalidate(member._id); recordAudit('staff.dentist_profile.updated', member);
        return send(response, 200, { success: true, data: { dentistId: member.dentistProfile } });
      }
      if (request.method === "GET" && url.pathname === "/api/v1/staff") {
        const lifecycle = url.searchParams.get('lifecycle') ?? 'all';
        if (!['current', 'active', 'pending', 'deactivated', 'all'].includes(lifecycle) || (url.searchParams.has('lifecycle') && (url.searchParams.has('isActive') || url.searchParams.has('setupComplete')))) return send(response, 400, { success: false });
        const matchesLifecycle = (member) => lifecycle === 'all' || lifecycle === 'current' && !member.deactivatedAt && (member.isActive || !member.isSetupComplete) ||
          lifecycle === 'active' && member.isActive && member.isSetupComplete && !member.deactivatedAt ||
          lifecycle === 'pending' && !member.isSetupComplete && !member.deactivatedAt ||
          lifecycle === 'deactivated' && (Boolean(member.deactivatedAt) || !member.isActive && member.isSetupComplete);
        const items = managedStaff.filter((member) => matchesLifecycle(member) && (!url.searchParams.has("role") || member.role === url.searchParams.get("role")) && (!url.searchParams.has("isActive") || member.isActive === (url.searchParams.get("isActive") === "true")) && (!url.searchParams.has("setupComplete") || member.isSetupComplete === (url.searchParams.get("setupComplete") === "true"))).sort((a, b) => a.name.localeCompare(b.name) || a._id.localeCompare(b._id));
        return paginated(items.map(safeMember), "staff");
      }
      if (request.method === "POST" && url.pathname === "/api/v1/staff/invite") {
        const body = await readJson(request).catch(() => null);
        const expectedKeys = body?.role === 'dentist' ? 'dentistProfileId,email,name,role' : 'email,name,role';
        if (!body || Object.keys(body).sort().join(",") !== expectedKeys || !isHumanName(body.name, 100) || !isEmail(body.email, true) || !["admin", "receptionist", "dentist"].includes(body.role) ||
            (body.role === 'dentist' && !managedDentists.some((item) => item._id === body.dentistProfileId))) return send(response, 400, { success: false });
        if (body.role === 'dentist' && managedStaff.some((item) => !item.deactivatedAt && item.dentistProfile === body.dentistProfileId)) return send(response, 409, { success: false });
        const email = body.email.trim().toLowerCase();
        let member = managedStaff.find((item) => item.email === email);
        if (member?.isSetupComplete) return send(response, 409, { success: false });
        if (member && (member.role !== body.role || member.dentistProfile !== (body.dentistProfileId ?? null))) return send(response, 409, { success: false });
        if (!member) {
          member = { _id: (0x3000 + ++governanceSequence).toString(16).padStart(24, "0"), name: body.name.trim(), email, role: body.role, dentistProfile: body.dentistProfileId ?? null, isActive: false, isSetupComplete: false, invitedBy: user.id, deactivatedAt: null, deactivatedBy: null, createdAt: stamp(), updatedAt: stamp() };
          managedStaff.push(member);
        }
        member.deactivatedAt = null; member.deactivatedBy = null; member.updatedAt = stamp();
        for (const item of previewInvitations) if (item.memberId === member._id && ['pending', 'opened'].includes(item.status)) item.status = 'replaced';
        previewInvitations.push({ id: randomUUID(), memberId: member._id, recipient: member.email, name: member.name,
          role: member.role, createdAt: stamp(), status: 'pending' });
        recordAudit("staff.invited", member);
        if (scenario === "staff-invite-uncertain") return send(response, 503, { success: false });
        return send(response, 201, { success: true, data: { staff: safeMember(member) } });
      }
      if (governanceStaffRoute) {
        const [, id, action] = governanceStaffRoute;
        const member = managedStaff.find((item) => item._id === id);
        if (!member) return send(response, 404, { success: false });
        if (!action && request.method === "GET") return send(response, 200, { success: true, data: { staff: safeMember(member) } });
        if ((action === "role" && request.method !== "PATCH") || (action !== "role" && request.method !== "POST")) return send(response, 405, { success: false });
        const body = action === "role" ? await readJson(request).catch(() => null) : {};
        if (action === "role" && (!body || !["role", "dentistProfileId"].every((key) => body[key] === undefined || typeof body[key] === "string") ||
            Object.keys(body).some((key) => !["role", "dentistProfileId"].includes(key)) || !["admin", "receptionist", "dentist"].includes(body.role))) return send(response, 400, { success: false });
        if (["role", "deactivate"].includes(action) && user.id === id) return send(response, 409, { success: false });
        if ((action === "deactivate" || (action === "role" && body.role !== "admin")) && member.role === "admin" && member.isActive && member.isSetupComplete && (scenario === "staff-last-admin-conflict" || managedStaff.filter((item) => item.role === "admin" && item.isActive && item.isSetupComplete).length <= 1)) return send(response, 409, { success: false });
        if (action === 'resend-invitation') {
          if (member.isSetupComplete || member.deactivatedAt) return send(response, 409, { success: false });
          for (const item of previewInvitations) if (item.memberId === member._id && ['pending', 'opened'].includes(item.status)) item.status = 'replaced';
          previewInvitations.push({ id: randomUUID(), memberId: member._id, recipient: member.email, name: member.name,
            role: member.role, createdAt: stamp(), status: 'pending' });
          member.updatedAt = stamp(); recordAudit('staff.invitation.resent', member);
          if (scenario === 'staff-invite-uncertain') return send(response, 503, { success: false });
          return send(response, 200, { success: true, data: { staff: safeMember(member) } });
        }
        if (action === 'cancel-invitation') {
          if (member.isSetupComplete || member.deactivatedAt) return send(response, 409, { success: false });
          member.isActive = false; member.deactivatedAt = stamp(); member.deactivatedBy = user.id; member.updatedAt = stamp();
          for (const item of previewInvitations) if (item.memberId === member._id && ['pending', 'opened'].includes(item.status)) item.status = 'cancelled';
          recordAudit('staff.invitation.cancelled', member);
          return send(response, 200, { success: true, data: { staff: safeMember(member) } });
        }
        if (action === 'deactivate' && !member.isSetupComplete) return send(response, 409, { success: false });
        if (action === "reactivate" && !member.isSetupComplete) return send(response, 409, { success: false });
        if (action === "reactivate" && member.dentistProfile && managedStaff.some((item) => item._id !== member._id && !item.deactivatedAt && item.dentistProfile === member.dentistProfile)) return send(response, 409, { success: false });
        if (action === "role") {
          if (body.role === 'dentist') {
            const requestedProfile = body.dentistProfileId ?? member.dentistProfile;
            if (!requestedProfile || !managedDentists.some((item) => item._id === requestedProfile) || managedStaff.some((item) => item._id !== member._id && !item.deactivatedAt && item.dentistProfile === requestedProfile)) return send(response, 409, { success: false });
            member.dentistProfile = requestedProfile;
          } else member.dentistProfile = null;
          member.role = body.role;
        }
        if (action === "deactivate") { member.isActive = false; member.deactivatedAt = stamp(); member.deactivatedBy = user.id; }
        if (action === "reactivate") { member.isActive = true; member.deactivatedAt = null; member.deactivatedBy = null; }
        member.updatedAt = stamp(); invalidate(id);
        recordAudit(action === "role" ? "staff.role.updated" : action === "revoke-sessions" ? "staff.sessions.revoked" : `staff.${action === "deactivate" ? "deactivated" : "reactivated"}`, member);
        return send(response, 200, { success: true, data: { staff: safeMember(member) } });
      }
      if (request.method === "GET" && url.pathname === "/api/v1/audit-logs") {
        const from = url.searchParams.get("from"); const to = url.searchParams.get("to");
        if ((from && !Number.isFinite(Date.parse(from))) || (to && !Number.isFinite(Date.parse(to))) || (from && to && Date.parse(from) > Date.parse(to))) return send(response, 400, { success: false });
        const items = auditHistory.filter((log) => ["action", "entityType", "entityId"].every((key) => !url.searchParams.has(key) || log[key] === url.searchParams.get(key)) && (!url.searchParams.has("actorId") || log.actor?._id === url.searchParams.get("actorId")) && (!from || Date.parse(log.createdAt) >= Date.parse(from)) && (!to || Date.parse(log.createdAt) <= Date.parse(to))).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b._id.localeCompare(a._id));
        return paginated(items, "logs");
      }
      return send(response, 404, { success: false });
    }
    const categoryRoute = url.pathname.match(/^\/api\/v1\/service-categories\/([0-9a-f]{24})(?:\/(restore))?$/i);
    const serviceRoute = url.pathname.match(/^\/api\/v1\/services\/([0-9a-f]{24})(?:\/(restore))?$/i);
    const dentistRoute = url.pathname.match(/^\/api\/v1\/dentists\/([0-9a-f]{24})(?:\/(restore))?$/i);
    const exceptionRoute = url.pathname.match(/^\/api\/v1\/dentists\/([0-9a-f]{24})\/schedule-exceptions(?:\/(\d{4}-\d{2}-\d{2}))?$/i);
    const closureRoute = url.pathname.match(/^\/api\/v1\/clinic\/closures(?:\/(\d{4}-\d{2}-\d{2}))?$/i);
    const managementProtected =
      url.pathname === "/api/v1/service-categories/admin/all" ||
      url.pathname === "/api/v1/services/admin/all" ||
      url.pathname === "/api/v1/dentists/admin/all" ||
      Boolean(exceptionRoute) || Boolean(closureRoute) ||
      (url.pathname === "/api/v1/service-categories" && request.method === "POST") ||
      (url.pathname === "/api/v1/services" && request.method === "POST") ||
      (url.pathname === "/api/v1/dentists" && request.method === "POST") ||
      (url.pathname === "/api/v1/clinic" && request.method === "PATCH") ||
      (Boolean(categoryRoute) && request.method !== "GET") ||
      (Boolean(serviceRoute) && request.method !== "GET") ||
      (Boolean(dentistRoute) && request.method !== "GET");
    if (managementProtected) {
      const user = authenticatedUser(request);
      if (!user) return send(response, 401, { success: false, code: "UNAUTHORIZED", message: "Authentication required" });
      if (user.role !== "admin") return send(response, 403, { success: false, code: "FORBIDDEN", message: "Access denied" });
      if (scenario === "catalog-error") {
        return send(response, 503, { success: false, code: "TEST_UPSTREAM_UNAVAILABLE", message: "Synthetic management failure" });
      }
      if (scenario === "validation" && request.method !== "GET") {
        return send(response, 400, { success: false, code: "VALIDATION_ERROR", message: "Synthetic management validation failure" });
      }

      if (request.method === "GET" && url.pathname === "/api/v1/service-categories/admin/all") {
        return send(response, 200, { success: true, data: { categories: managedCategories } });
      }
      if (request.method === "POST" && url.pathname === "/api/v1/service-categories") {
        const body = await readJson(request).catch(() => null);
        if (!body?.translations?.hy?.name) return send(response, 400, { success: false, code: "VALIDATION_ERROR", message: "Invalid category" });
        const created = {
          ...structuredClone(category),
          _id: "64b000000000000000000002",
          name: body.translations.hy.name,
          slug: "preview-created-category",
          description: body.translations.hy.description || "",
          translations: body.translations,
          imageUrl: "",
          sortOrder: body.sortOrder,
          isActive: body.isActive,
          createdAt: stamp(), updatedAt: stamp(),
        };
        managedCategories.push(created);
        return send(response, 201, { success: true, data: { category: created } });
      }
      if (categoryRoute) {
        const item = managedCategories.find((entry) => entry._id === categoryRoute[1]);
        if (!item) return send(response, 404, { success: false, code: "NOT_FOUND", message: "Category not found" });
        if (request.method === "PATCH" && categoryRoute[2] === "restore") {
          item.isActive = true;
          item.updatedAt = stamp();
          return send(response, 200, { success: true, data: { category: item } });
        }
        if (request.method === "PATCH") {
          const body = await readJson(request).catch(() => null);
          if (!body) return send(response, 400, { success: false, code: "VALIDATION_ERROR" });
          Object.assign(item, body, {
            ...(body.translations ? {
              name: body.translations.hy?.name || item.name,
              description: body.translations.hy?.description || "",
            } : {}),
            updatedAt: stamp(),
          });
          return send(response, 200, { success: true, data: { category: item } });
        }
        if (request.method === "DELETE") {
          if (managedServices.some((entry) => entry.isActive && entry.category._id === item._id)) {
            return send(response, 409, { success: false, code: "CATEGORY_HAS_ACTIVE_SERVICES", message: "Active services still reference this category" });
          }
          item.isActive = false;
          item.updatedAt = stamp();
          return send(response, 200, { success: true, data: { category: item } });
        }
      }

      if (request.method === "GET" && url.pathname === "/api/v1/services/admin/all") {
        return send(response, 200, { success: true, data: { services: managedServices } });
      }
      if (request.method === "POST" && url.pathname === "/api/v1/services") {
        const body = await readJson(request).catch(() => null);
        const linkedCategory = managedCategories.find((entry) => entry._id === body?.category);
        if (!body?.translations?.hy?.name || !linkedCategory) return send(response, 409, { success: false, code: "RELATION_UNAVAILABLE", message: "Category unavailable" });
        const created = {
          ...structuredClone(service),
          _id: "64b000000000000000000012",
          name: body.translations.hy.name,
          slug: "preview-created-service",
          shortDescription: body.translations.hy.shortDescription || "",
          description: body.translations.hy.description || "",
          translations: body.translations,
          category: categorySummary(linkedCategory),
          priceType: body.priceType,
          priceFrom: body.priceFrom ?? null,
          priceTo: body.priceTo ?? null,
          durationMinutes: body.durationMinutes,
          imageUrl: "",
          image: null,
          isFeatured: body.isFeatured,
          bookingEnabled: body.bookingEnabled,
          isActive: body.isActive,
          sortOrder: body.sortOrder,
          createdAt: stamp(), updatedAt: stamp(),
        };
        managedServices.push(created);
        return send(response, 201, { success: true, data: { service: created } });
      }
      if (serviceRoute) {
        const item = managedServices.find((entry) => entry._id === serviceRoute[1]);
        if (!item) return send(response, 404, { success: false, code: "NOT_FOUND", message: "Service not found" });
        if (request.method === "PATCH" && serviceRoute[2] === "restore") {
          item.isActive = true;
          item.updatedAt = stamp();
          return send(response, 200, { success: true, data: { service: item } });
        }
        if (request.method === "PATCH") {
          const body = await readJson(request).catch(() => null);
          const linkedCategory = body?.category ? managedCategories.find((entry) => entry._id === body.category) : null;
          if (body?.category && !linkedCategory) return send(response, 409, { success: false, code: "RELATION_UNAVAILABLE", message: "Category unavailable" });
          Object.assign(item, body, {
            ...(body.translations ? {
              name: body.translations.hy?.name || item.name,
              shortDescription: body.translations.hy?.shortDescription || "",
              description: body.translations.hy?.description || "",
            } : {}),
            ...(linkedCategory ? { category: categorySummary(linkedCategory) } : {}),
            updatedAt: stamp(),
          });
          return send(response, 200, { success: true, data: { service: item } });
        }
        if (request.method === "DELETE") {
          item.isActive = false;
          item.bookingEnabled = false;
          item.updatedAt = stamp();
          return send(response, 200, { success: true, data: { service: item } });
        }
      }

      if (request.method === "GET" && url.pathname === "/api/v1/dentists/admin/all") {
        return send(response, 200, { success: true, data: { dentists: managedDentists } });
      }
      if (request.method === "POST" && url.pathname === "/api/v1/dentists") {
        const body = await readJson(request).catch(() => null);
        if (!body?.firstName || !body?.lastName || !body?.translations?.hy?.title) return send(response, 400, { success: false, code: "VALIDATION_ERROR", message: "Invalid dentist" });
        const created = {
          ...structuredClone(dentist),
          _id: "64b000000000000000000022",
          firstName: body.firstName,
          lastName: body.lastName,
          slug: "preview-created-dentist",
          title: body.translations.hy.title,
          bio: body.translations.hy.bio || "",
          specializations: body.translations.hy.specializations || [],
          translations: body.translations,
          experienceYears: body.experienceYears,
          photoUrl: "",
          photo: null,
          languages: body.languages,
          services: (body.services || []).map((id) => managedServices.find((entry) => entry._id === id)).filter(Boolean).map(serviceSummary),
          weeklySchedule: body.weeklySchedule,
          scheduleRevision: 0,
          isFeatured: body.isFeatured,
          bookingEnabled: body.bookingEnabled,
          isActive: body.isActive,
          sortOrder: body.sortOrder,
          createdAt: stamp(), updatedAt: stamp(),
        };
        managedDentists.push(created);
        return send(response, 201, { success: true, data: { dentist: created } });
      }
      if (dentistRoute) {
        const item = managedDentists.find((entry) => entry._id === dentistRoute[1]);
        if (!item) return send(response, 404, { success: false, code: "NOT_FOUND", message: "Dentist not found" });
        if (request.method === "PATCH" && dentistRoute[2] === "restore") {
          item.isActive = true;
          item.updatedAt = stamp();
          return send(response, 200, { success: true, data: { dentist: item } });
        }
        if (request.method === "PATCH") {
          const body = await readJson(request).catch(() => null);
          if (!body) return send(response, 400, { success: false, code: "VALIDATION_ERROR" });
          if (body.weeklySchedule) {
            if (rejectScheduleMutation({
              response,
              expectedRevision: body.expectedScheduleRevision,
              acknowledgement: body.scheduleConflictAcknowledgement,
              currentRevision: item.scheduleRevision,
              bumpRevision: () => ++item.scheduleRevision,
            })) return;
            item.weeklySchedule = body.weeklySchedule;
            item.scheduleRevision += 1;
          } else {
            const services = body.services?.map((id) => managedServices.find((entry) => entry._id === id));
            if (services?.some((entry) => !entry)) return send(response, 409, { success: false, code: "RELATION_UNAVAILABLE", message: "Service unavailable" });
            Object.assign(item, body, {
              ...(body.translations ? {
                title: body.translations.hy?.title || item.title,
                bio: body.translations.hy?.bio || "",
                specializations: body.translations.hy?.specializations || [],
              } : {}),
              ...(services ? { services: services.map(serviceSummary) } : {}),
            });
          }
          item.updatedAt = stamp();
          return send(response, 200, { success: true, data: { dentist: item } });
        }
        if (request.method === "DELETE") {
          item.isActive = false;
          item.bookingEnabled = false;
          item.updatedAt = stamp();
          return send(response, 200, { success: true, data: { dentist: item } });
        }
      }

      if (exceptionRoute) {
        const parent = managedDentists.find((entry) => entry._id === exceptionRoute[1]);
        if (!parent) return send(response, 404, { success: false, code: "NOT_FOUND", message: "Dentist not found" });
        const date = exceptionRoute[2];
        if (request.method === "GET" && !date) {
          const from = url.searchParams.get("from") || "0000-00-00";
          const to = url.searchParams.get("to") || "9999-99-99";
          return send(response, 200, { success: true, data: { exceptions: scheduleExceptions.filter((item) => item.dentist === parent._id && item.date >= from && item.date <= to) } });
        }
        if (request.method === "PUT" && date) {
          const body = await readJson(request).catch(() => null);
          if (!body || rejectScheduleMutation({ response, expectedRevision: body?.expectedScheduleRevision, acknowledgement: body?.scheduleConflictAcknowledgement, currentRevision: parent.scheduleRevision, bumpRevision: () => ++parent.scheduleRevision })) return;
          const value = {
            _id: scheduleExceptions.find((item) => item.dentist === parent._id && item.date === date)?._id || "64b000000000000000000081",
            dentist: parent._id,
            date,
            isWorking: body.isWorking,
            shifts: body.shifts,
            note: body.note,
            createdAt: scheduleExceptions.find((item) => item.dentist === parent._id && item.date === date)?.createdAt ?? stamp(),
            updatedAt: stamp(),
          };
          scheduleExceptions = [...scheduleExceptions.filter((item) => item.dentist !== parent._id || item.date !== date), value];
          parent.scheduleRevision += 1;
          return send(response, 200, { success: true, data: { exception: value } });
        }
        if (request.method === "DELETE" && date) {
          const expectedRevision = Number(url.searchParams.get("expectedScheduleRevision"));
          const acknowledgement = url.searchParams.get("scheduleConflictAcknowledgement") || undefined;
          if (rejectScheduleMutation({ response, expectedRevision, acknowledgement, currentRevision: parent.scheduleRevision, bumpRevision: () => ++parent.scheduleRevision })) return;
          scheduleExceptions = scheduleExceptions.filter((item) => item.dentist !== parent._id || item.date !== date);
          parent.scheduleRevision += 1;
          return send(response, 200, { success: true, data: {} });
        }
      }

      if (closureRoute) {
        const date = closureRoute[1];
        if (request.method === "GET" && !date) {
          const from = url.searchParams.get("from") || "0000-00-00";
          const to = url.searchParams.get("to") || "9999-99-99";
          return send(response, 200, { success: true, data: { closures: clinicClosures.filter((item) => item.date >= from && item.date <= to) } });
        }
        if (request.method === "PUT" && date) {
          const body = await readJson(request).catch(() => null);
          if (!body || rejectScheduleMutation({ response, expectedRevision: body?.expectedScheduleRevision, acknowledgement: body?.scheduleConflictAcknowledgement, currentRevision: managedClinic.scheduleRevision, bumpRevision: () => ++managedClinic.scheduleRevision })) return;
          const value = {
            _id: clinicClosures.find((item) => item.date === date)?._id || "64b000000000000000000082",
            date,
            isOpen: body.isOpen,
            shifts: body.shifts,
            note: body.note,
            createdAt: clinicClosures.find((item) => item.date === date)?.createdAt ?? stamp(),
            updatedAt: stamp(),
          };
          clinicClosures = [...clinicClosures.filter((item) => item.date !== date), value];
          managedClinic.scheduleRevision += 1;
          return send(response, 200, { success: true, data: { closure: value } });
        }
        if (request.method === "DELETE" && date) {
          const expectedRevision = Number(url.searchParams.get("expectedScheduleRevision"));
          const acknowledgement = url.searchParams.get("scheduleConflictAcknowledgement") || undefined;
          if (rejectScheduleMutation({ response, expectedRevision, acknowledgement, currentRevision: managedClinic.scheduleRevision, bumpRevision: () => ++managedClinic.scheduleRevision })) return;
          clinicClosures = clinicClosures.filter((item) => item.date !== date);
          managedClinic.scheduleRevision += 1;
          return send(response, 200, { success: true, data: {} });
        }
      }

      if (request.method === "PATCH" && url.pathname === "/api/v1/clinic") {
        const body = await readJson(request).catch(() => null);
        if (!body) return send(response, 400, { success: false, code: "VALIDATION_ERROR" });
        if (body.weeklySchedule) {
          if (rejectScheduleMutation({
            response,
            expectedRevision: body.expectedScheduleRevision,
            acknowledgement: body.scheduleConflictAcknowledgement,
            currentRevision: managedClinic.scheduleRevision,
            bumpRevision: () => ++managedClinic.scheduleRevision,
          })) return;
          managedClinic.weeklySchedule = body.weeklySchedule;
          managedClinic.scheduleRevision += 1;
        } else {
          Object.assign(managedClinic, body, {
            ...(body.translations ? {
              clinicName: body.translations.hy?.clinicName || managedClinic.clinicName,
              tagline: body.translations.hy?.tagline || "",
              description: body.translations.hy?.description || "",
              address: body.translations.hy?.address || "",
            } : {}),
            ...(body.socialLinks ? { socialLinks: { ...managedClinic.socialLinks, ...body.socialLinks } } : {}),
            ...(body.bookingSettings ? { bookingSettings: { ...managedClinic.bookingSettings, ...body.bookingSettings } } : {}),
          });
        }
        managedClinic.updatedAt = stamp();
        return send(response, 200, { success: true, data: { clinic: managedClinic } });
      }

      return send(response, 405, { success: false, code: "METHOD_NOT_ALLOWED", message: "Method not allowed" });
    }

    const galleryItemRoute = url.pathname.match(/^\/api\/v1\/media\/gallery\/([0-9a-f]{24})(?:\/(restore))?$/i);
    const dentistMediaRoute = url.pathname.match(/^\/api\/v1\/media\/dentists\/([0-9a-f]{24})\/photo$/i);
    const serviceMediaRoute = url.pathname.match(/^\/api\/v1\/media\/services\/([0-9a-f]{24})\/image$/i);
    const cleanupRoute = url.pathname.match(/^\/api\/v1\/media\/cleanup-jobs(?:\/([0-9a-f]{24})\/retry)?$/i);
    const beforeAfterAdminRoute = url.pathname.match(/^\/api\/v1\/before-after\/([0-9a-f]{24})(?:\/(restore|consent\/withdraw|purge|before-image|after-image))?$/i);
    const mediaProtected =
      url.pathname === "/api/v1/media/gallery/admin" ||
      (url.pathname === "/api/v1/media/gallery" && request.method === "POST") ||
      Boolean(galleryItemRoute) || Boolean(dentistMediaRoute) || Boolean(serviceMediaRoute) ||
      Boolean(cleanupRoute) || url.pathname === "/api/v1/before-after/admin/all" ||
      (url.pathname === "/api/v1/before-after" && request.method === "POST") ||
      (Boolean(beforeAfterAdminRoute) && request.method !== "GET");
    if (mediaProtected) {
      const user = authenticatedUser(request);
      if (!user) return send(response, 401, { success: false, code: "UNAUTHORIZED", message: "Authentication required" });
      if (user.role !== "admin") return send(response, 403, { success: false, code: "FORBIDDEN", message: "Access denied" });
      if (scenario === "media-conflict" && request.method !== "GET") {
        return send(response, 409, { success: false, code: "MEDIA_STATE_CHANGED", message: "Synthetic media conflict" });
      }

      if (request.method === "GET" && url.pathname === "/api/v1/media/gallery/admin") {
        return send(response, 200, { success: true, data: { images: managedGallery } });
      }
      if (request.method === "POST" && url.pathname === "/api/v1/media/gallery") {
        if (scenario === "media-rate-limit") return send(response, 429, { success: false, code: "RATE_LIMITED" }, { "retry-after": "60" });
        if (scenario === "media-unsupported") return send(response, 415, { success: false, code: "UNSUPPORTED_MEDIA_TYPE" });
        const form = await readMultipart(request).catch(() => null);
        const upload = form?.files?.image;
        const translations = parseMultipartJson(form?.fields?.translations);
        if (!upload || upload.size === 0 || !translations?.hy?.altText) return send(response, 400, { success: false, code: "VALIDATION_ERROR" });
        if (upload.size > 5 * 1024 * 1024) return send(response, 413, { success: false, code: "PAYLOAD_TOO_LARGE" });
        if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(upload.mediaType)) return send(response, 415, { success: false, code: "UNSUPPORTED_MEDIA_TYPE" });
        const created = {
          _id: nextMediaId(), type: "clinic_gallery", image: image(`gallery-upload-${mediaSequence}`),
          altText: translations.hy.altText, caption: translations.hy.caption || "", translations,
          sortOrder: Number(form.fields.sortOrder || 0), isActive: form.fields.isActive !== "false",
          createdBy: user, createdAt: stamp(), updatedAt: stamp(),
        };
        managedGallery = [created, ...managedGallery];
        return send(response, 201, { success: true, data: { image: created } });
      }
      if (galleryItemRoute) {
        const item = managedGallery.find((entry) => entry._id === galleryItemRoute[1]);
        if (!item) return send(response, 404, { success: false, code: "NOT_FOUND" });
        if (request.method === "PATCH" && galleryItemRoute[2] === "restore") {
          item.isActive = true; item.updatedAt = stamp();
          return send(response, 200, { success: true, data: { image: item } });
        }
        if (request.method === "PATCH") {
          const body = await readJson(request).catch(() => null);
          if (!body) return send(response, 400, { success: false, code: "VALIDATION_ERROR" });
          if (body.translations) {
            for (const [locale, translation] of Object.entries(body.translations)) {
              item.translations[locale] = { ...(item.translations[locale] || {}), ...translation };
            }
            item.altText = item.translations.hy?.altText || item.altText;
            item.caption = item.translations.hy?.caption || "";
          }
          if (Number.isInteger(body.sortOrder)) item.sortOrder = body.sortOrder;
          item.updatedAt = stamp();
          return send(response, 200, { success: true, data: { image: item } });
        }
        if (request.method === "DELETE") {
          item.isActive = false; item.updatedAt = stamp();
          return send(response, 200, { success: true, message: "Gallery image archived" });
        }
      }

      if (dentistMediaRoute || serviceMediaRoute) {
        const isDentist = Boolean(dentistMediaRoute);
        const id = (dentistMediaRoute || serviceMediaRoute)[1];
        const collection = isDentist ? managedDentists : managedServices;
        const item = collection.find((entry) => entry._id === id);
        if (!item) return send(response, 404, { success: false, code: "NOT_FOUND" });
        const field = isDentist ? "photo" : "image";
        if (request.method === "PUT") {
          const form = await readMultipart(request).catch(() => null);
          if (scenario === "media-replacement-failure") return send(response, 503, { success: false, code: "SYNTHETIC_REPLACEMENT_FAILURE" });
          if (!form?.files?.image) return send(response, 400, { success: false, code: "VALIDATION_ERROR" });
          item[field] = image(`${isDentist ? "dentist" : "service"}-replacement-${++mediaSequence}`);
          item.updatedAt = stamp();
          return send(response, 200, { success: true, data: { [isDentist ? "dentist" : "service"]: item } });
        }
        if (request.method === "DELETE") {
          item[field] = null; item.updatedAt = stamp();
          return send(response, 200, { success: true, data: { [isDentist ? "dentist" : "service"]: item } });
        }
      }

      if (cleanupRoute) {
        if (request.method === "GET" && !cleanupRoute[1]) {
          const status = url.searchParams.get("status");
          const page = Math.max(1, Number(url.searchParams.get("page") || 1));
          const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 50)));
          const filtered = mediaCleanupJobs.filter((job) => !status || job.status === status);
          const start = (page - 1) * limit;
          return send(response, 200, { success: true, data: {
            jobs: filtered.slice(start, start + limit),
            pagination: { page, limit, total: filtered.length, pages: Math.ceil(filtered.length / limit) },
          } });
        }
        if (request.method === "POST" && cleanupRoute[1]) {
          const job = mediaCleanupJobs.find((entry) => entry._id === cleanupRoute[1]);
          if (!job || !["failed", "pending"].includes(job.status)) return send(response, 404, { success: false, code: "NOT_FOUND" });
          job.status = "pending"; job.attempts = 0; job.updatedAt = stamp();
          return send(response, 202, { success: true, data: { job } });
        }
      }

      if (request.method === "GET" && url.pathname === "/api/v1/before-after/admin/all") {
        const page = Math.max(1, Number(url.searchParams.get("page") || 1));
        const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 24)));
        const start = (page - 1) * limit;
        return send(response, 200, { success: true, data: {
          cases: managedBeforeAfter.slice(start, start + limit),
          pagination: { page, limit, total: managedBeforeAfter.length, pages: Math.ceil(managedBeforeAfter.length / limit) },
        } });
      }
      if (request.method === "POST" && url.pathname === "/api/v1/before-after") {
        const form = await readMultipart(request).catch(() => null);
        if (scenario === "media-pair-failure") return send(response, 503, { success: false, code: "SYNTHETIC_PAIR_ROLLBACK" });
        const translations = parseMultipartJson(form?.fields?.translations);
        const active = form?.fields?.isActive !== "false";
        if (!form?.files?.beforeImage || !form?.files?.afterImage || form?.fields?.consentConfirmed !== "true" || !form?.fields?.consentMethod || (active && !translations?.hy?.title)) {
          return send(response, 400, { success: false, code: "VALIDATION_ERROR" });
        }
        if (form.fields.consentMethod === "external" && !form.fields.externalConsentReference) {
          return send(response, 400, { success: false, code: "VALIDATION_ERROR" });
        }
        const created = {
          _id: nextMediaId(), title: translations.hy?.title || "", description: translations.hy?.description || "",
          translations,
          service: managedServices.find((entry) => entry._id === form.fields.serviceId) || null,
          dentist: managedDentists.find((entry) => entry._id === form.fields.dentistId) || null,
          beforeImage: image(`before-upload-${mediaSequence}`), afterImage: image(`after-upload-${mediaSequence}`),
          publicationStatus: active ? "published" : "draft", consentStatus: "active",
          consentPolicyVersion: "preview-2026-01", consentMethod: form.fields.consentMethod,
          consentConfirmedAt: stamp(), consentRecordedBy: user.id,
          externalConsentReference: form.fields.externalConsentReference || "", withdrawnAt: null,
          withdrawnBy: null, withdrawalReason: "", purgedAt: null, purgedBy: null,
          consentHistory: [{ action: "confirmed", policyVersion: "preview-2026-01", method: form.fields.consentMethod, actor: user.id, occurredAt: stamp(), reason: "" }],
          isFeatured: form.fields.isFeatured === "true", isActive: active,
          sortOrder: Number(form.fields.sortOrder || 0), createdBy: user, createdAt: stamp(), updatedAt: stamp(),
        };
        managedBeforeAfter = [created, ...managedBeforeAfter];
        return send(response, 201, { success: true, data: { case: created } });
      }
      if (beforeAfterAdminRoute) {
        const item = managedBeforeAfter.find((entry) => entry._id === beforeAfterAdminRoute[1]);
        const action = beforeAfterAdminRoute[2];
        if (!item) return send(response, 404, { success: false, code: "NOT_FOUND" });
        if (request.method === "PATCH" && !action) {
          const body = await readJson(request).catch(() => null);
          if (!body) return send(response, 400, { success: false, code: "VALIDATION_ERROR" });
          if (body.translations) {
            for (const [locale, translation] of Object.entries(body.translations)) item.translations[locale] = { ...(item.translations[locale] || {}), ...translation };
            item.title = item.translations.hy?.title || item.title;
            item.description = item.translations.hy?.description || "";
          }
          if (body.serviceId !== undefined) item.service = managedServices.find((entry) => entry._id === body.serviceId) || null;
          if (body.dentistId !== undefined) item.dentist = managedDentists.find((entry) => entry._id === body.dentistId) || null;
          if (typeof body.isFeatured === "boolean") item.isFeatured = body.isFeatured;
          if (Number.isInteger(body.sortOrder)) item.sortOrder = body.sortOrder;
          item.updatedAt = stamp();
          return send(response, 200, { success: true, data: { case: item } });
        }
        if (request.method === "DELETE" && !action) {
          if (item.consentStatus !== "active") return send(response, 409, { success: false, code: "CONSENT_STATE_CHANGED" });
          item.isActive = false; item.publicationStatus = "draft"; item.updatedAt = stamp();
          return send(response, 200, { success: true, message: "Case unpublished" });
        }
        if (request.method === "PATCH" && action === "restore") {
          if (item.consentStatus !== "active") return send(response, 409, { success: false, code: "CONSENT_STATE_CHANGED" });
          item.isActive = true; item.publicationStatus = "published"; item.updatedAt = stamp();
          return send(response, 200, { success: true, data: { case: item } });
        }
        if (request.method === "PUT" && ["before-image", "after-image"].includes(action)) {
          const form = await readMultipart(request).catch(() => null);
          if (scenario === "media-replacement-failure") return send(response, 503, { success: false, code: "SYNTHETIC_REPLACEMENT_FAILURE" });
          if (item.consentStatus !== "active" || !form?.files?.image) return send(response, 409, { success: false, code: "CONSENT_STATE_CHANGED" });
          item[action === "before-image" ? "beforeImage" : "afterImage"] = image(`${action}-${++mediaSequence}`);
          item.updatedAt = stamp();
          return send(response, 200, { success: true, data: { case: item } });
        }
        if (request.method === "POST" && action === "consent/withdraw") {
          const body = await readJson(request).catch(() => null);
          if (!body?.reason || item.consentStatus !== "active") return send(response, 409, { success: false, code: "CONSENT_STATE_CHANGED" });
          item.consentStatus = "withdrawn"; item.publicationStatus = "withdrawn"; item.isActive = false;
          item.isFeatured = false; item.withdrawnAt = stamp(); item.withdrawnBy = user.id;
          item.withdrawalReason = body.reason; item.updatedAt = stamp();
          return send(response, 200, { success: true, data: { case: item } });
        }
        if (request.method === "POST" && action === "purge") {
          const body = await readJson(request).catch(() => null);
          if (!body || body.confirmation !== "PERMANENTLY PURGE BEFORE AFTER MEDIA") return send(response, 400, { success: false, code: "VALIDATION_ERROR" });
          if (item.consentStatus !== "withdrawn") return send(response, 409, { success: false, code: "CONSENT_STATE_CHANGED" });
          item.beforeImage = null; item.afterImage = null; item.consentStatus = "purged"; item.publicationStatus = "purged";
          item.externalConsentReference = ""; item.purgedAt = stamp(); item.purgedBy = user.id;
          item.updatedAt = stamp();
          return send(response, 202, { success: true, data: { case: item } });
        }
      }
      return send(response, 405, { success: false, code: "METHOD_NOT_ALLOWED" });
    }

    const ownRoute = url.pathname.match(/^\/api\/v1\/appointments\/mine(?:\/details\/([0-9a-f]{24}))?$/i);
    if (ownRoute) {
      const user = authenticatedUser(request);
      if (!user) return send(response, 401, { success: false, code: 'UNAUTHORIZED' });
      if (user.role !== 'dentist') return send(response, 403, { success: false, code: 'FORBIDDEN' });
      if (request.method !== 'GET') return send(response, 405, { success: false });
      if ([...url.searchParams.keys()].some((key) => !['page', 'limit', 'date', 'from', 'to'].includes(key))) return send(response, 400, { success: false });
      const profile = managedStaff.find((member) => member._id === user.id)?.dentistProfile;
      if (!managedDentists.some((doctor) => doctor._id === profile)) return send(response, 403, { success: false, code: 'DENTIST_PROFILE_REQUIRED' });
      const minimal = (item) => ({ _id: item._id, patientName: item.patientName, patientPhone: item.patientPhone,
        date: item.date, startTime: item.startTime, endTime: item.endTime, status: item.status,
        serviceSnapshot: { name: item.serviceSnapshot.name, durationMinutes: item.serviceSnapshot.durationMinutes,
          translations: Object.fromEntries(['hy', 'ru', 'en'].flatMap((locale) => item.serviceSnapshot.translations?.[locale]?.name ? [[locale, { name: item.serviceSnapshot.translations[locale].name }]] : [])) },
      });
      const owned = appointments.filter((item) => item.dentist === profile);
      if (ownRoute[1]) {
        const item = owned.find((row) => row._id === ownRoute[1]);
        return item ? send(response, 200, { success: true, data: { appointment: minimal(item) } }) : send(response, 404, { success: false });
      }
      const page = Number(url.searchParams.get('page') || 1), limit = Number(url.searchParams.get('limit') || 25);
      if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 50) return send(response, 400, { success: false });
      const today = clinicDate(0);
      const visible = owned.filter((item) => (!url.searchParams.get('date') || item.date === url.searchParams.get('date')) &&
        (url.searchParams.get('date') || item.date >= (url.searchParams.get('from') || today)) &&
        (!url.searchParams.get('to') || item.date <= url.searchParams.get('to'))).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
      return send(response, 200, { success: true, data: { appointments: visible.slice((page - 1) * limit, page * limit).map(minimal), today, timezone: clinic.timezone,
        pagination: { page, limit, total: visible.length, pages: Math.ceil(visible.length / limit) } } });
    }
    const appointmentRoute = url.pathname.match(/^\/api\/v1\/appointments\/([0-9a-f]{24})(?:\/(availability|status|cancel|reschedule))?$/i);
    const protectedAppointmentsRoute =
      url.pathname === "/api/v1/appointments/admin" ||
      (url.pathname === "/api/v1/appointments" && request.method === "GET") ||
      Boolean(appointmentRoute);
    if (protectedAppointmentsRoute) {
      const user = authenticatedUser(request);
      if (!user) return send(response, 401, { success: false, code: "UNAUTHORIZED", message: "Authentication required" });
      if (user.role === "dentist") return send(response, 403, { success: false, code: "FORBIDDEN", message: "Access denied" });

      if (request.method === "GET" && url.pathname === "/api/v1/appointments") {
        const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
        const limit = Math.min(25, Math.max(1, Number(url.searchParams.get("limit") || "25")));
        const filtered = appointments.filter((appointment) => (
          (!url.searchParams.get("date") || appointment.date === url.searchParams.get("date")) &&
          (!url.searchParams.get("from") || appointment.date >= url.searchParams.get("from")) &&
          (!url.searchParams.get("to") || appointment.date <= url.searchParams.get("to")) &&
          (!url.searchParams.get("status") || appointment.status === url.searchParams.get("status")) &&
          (!url.searchParams.get("dentistId") || appointment.dentist === url.searchParams.get("dentistId")) &&
          (!url.searchParams.get("serviceId") || appointment.service === url.searchParams.get("serviceId"))
        ));
        const start = (page - 1) * limit;
        return send(response, 200, { success: true, data: {
          appointments: filtered.slice(start, start + limit),
          pagination: { page, limit, total: filtered.length, pages: Math.ceil(filtered.length / limit) },
        } });
      }

      if (request.method === "POST" && url.pathname === "/api/v1/appointments/admin") {
        const body = await readJson(request).catch(() => null);
        if (!body || (content ? !validPatient(body) : typeof body.patientName !== "string" || typeof body.patientPhone !== "string" || body.privacyAccepted !== true)) {
          return send(response, 400, { success: false, code: "VALIDATION_ERROR", message: "Invalid appointment" });
        }
        const endTime = endTimeFor(body.startTime, body.serviceId);
        if (content && !cleanRelationship(body.dentistId, body.serviceId)) return send(response, 400, { success: false, code: 'VALIDATION_ERROR' });
        if (content && !cleanSlotAvailable(body.date, body.startTime, endTime, body.dentistId)) return send(response, 409, { success: false, code: 'SLOT_UNAVAILABLE' });
        const created = {
          ...makeAppointment({
            id: content ? idForPreview(900 + appointments.length) : "64b000000000000000000079", code: content ? `DC-${(900 + appointments.length).toString(16).padStart(16, '0').toUpperCase()}` : "DC-1234567890ABCDE9", status: "confirmed",
            date: body.date, startTime: body.startTime, endTime,
            patientName: body.patientName, patientPhone: content ? canonicalPhone(body.patientPhone) : body.patientPhone, patientEmail: body.patientEmail || "",
            dentistId: body.dentistId, serviceId: body.serviceId,
          }),
          patientComment: body.patientComment || "",
          internalNote: body.internalNote || "",
          privacyConsentMethod: body.consentMethod,
          notificationLocale: body.locale,
          source: body.source,
        };
        appointments = [created, ...appointments.filter((item) => item._id !== created._id)];
        return send(response, 201, { success: true, data: { appointment: created } });
      }

      const appointment = appointments.find((item) => item._id === appointmentRoute?.[1]);
      if (!appointment) return send(response, 404, { success: false, code: "NOT_FOUND", message: "Appointment not found" });
      const action = appointmentRoute?.[2];
      if (request.method === "GET" && !action) {
        return send(response, 200, { success: true, data: { appointment } });
      }
      if (request.method === "GET" && action === "availability") {
        const expectedVersion = Number(url.searchParams.get("expectedMutationVersion"));
        if (expectedVersion !== appointment.mutationVersion) return versionConflict(response, appointment);
        if (scenario === "staff-stale-availability" && !staffConflictReturned) {
          staffConflictReturned = true;
          appointment.mutationVersion += 1;
          appointment.updatedAt = stamp();
          return versionConflict(response, appointment);
        }
        const date = url.searchParams.get("date") || appointment.date;
        if (content && !cleanDateAllowed(date)) return send(response, 400, { success: false, code: 'VALIDATION_ERROR' });
        const dentistId = url.searchParams.get('dentistId') || appointment.dentist;
        const serviceId = url.searchParams.get('serviceId') || appointment.service;
        if (content && !cleanRelationship(dentistId, serviceId)) return send(response, 400, { success: false, code: 'VALIDATION_ERROR' });
        const starts = ["09:00", "12:00", "14:30"];
        const slots = starts.map((start) => {
          const end = endTimeFor(start, content ? serviceId : undefined);
          return { start, end, ...appointmentTimes(date, start, end) };
        }).filter((slot) => !content || cleanSlotAvailable(date, slot.start, slot.end, dentistId, appointment._id));
        return send(response, 200, { success: true, data: { availability: {
          date,
          timezone: clinic.timezone,
          available: slots.length > 0,
          reason: slots.length ? null : 'FULLY_BOOKED',
          dentist: { id: url.searchParams.get("dentistId") },
          service: { id: url.searchParams.get("serviceId") },
          rules: { slotIntervalMinutes: 30, bufferMinutes: 0, minBookingNoticeMinutes: 120 },
          slots,
        } } });
      }
      if (["status", "cancel", "reschedule"].includes(action) && ["POST", "PATCH"].includes(request.method)) {
        const body = await readJson(request).catch(() => null);
        if (!body || body.expectedMutationVersion !== appointment.mutationVersion) return versionConflict(response, appointment);
        if (scenario === "staff-conflict" && !staffConflictReturned) {
          staffConflictReturned = true;
          appointment.mutationVersion += 1;
          appointment.updatedAt = stamp();
          return versionConflict(response, appointment);
        }
        if (action === 'status') {
          const transitions = { pending: ['confirmed', 'no_show'], confirmed: ['checked_in', 'in_progress', 'completed', 'no_show'], checked_in: ['in_progress', 'completed'], in_progress: ['completed'] };
          if (!transitions[appointment.status]?.includes(body.status)) return send(response, 409, { success: false });
          appointment.status = body.status;
        }
        if (action === "cancel") {
          if (!['pending', 'confirmed', 'checked_in', 'in_progress'].includes(appointment.status)) return send(response, 409, { success: false });
          appointment.status = "cancelled";
          appointment.cancellationReason = body.reason;
          appointment.cancelledAt = stamp();
        }
        if (action === "reschedule") {
          if (!['pending', 'confirmed'].includes(appointment.status)) return send(response, 409, { success: false });
          if (content && !cleanDateAllowed(body.date)) return send(response, 400, { success: false, code: 'VALIDATION_ERROR' });
          const dentistId = body.dentistId || appointment.dentist;
          const serviceId = body.serviceId || appointment.service;
          const nextEnd = endTimeFor(body.startTime, content ? serviceId : undefined);
          if (content && !cleanRelationship(dentistId, serviceId)) return send(response, 400, { success: false, code: 'VALIDATION_ERROR' });
          if (content && !cleanSlotAvailable(body.date, body.startTime, nextEnd, dentistId, appointment._id)) return send(response, 409, { success: false, code: 'SLOT_UNAVAILABLE' });
          const previous = {
            date: appointment.date, startTime: appointment.startTime, endTime: appointment.endTime,
            dentist: appointment.dentist, service: appointment.service, reason: body.reason || "",
          };
          appointment.date = body.date;
          appointment.startTime = body.startTime;
          appointment.endTime = nextEnd;
          Object.assign(appointment, appointmentTimes(appointment.date, appointment.startTime, appointment.endTime));
          appointment.dentist = body.dentistId || appointment.dentist;
          appointment.service = body.serviceId || appointment.service;
          if (content) {
            const refreshed = makeAppointment({ ...appointment, dentistId, serviceId });
            appointment.dentistSnapshot = refreshed.dentistSnapshot;
            appointment.serviceSnapshot = refreshed.serviceSnapshot;
            appointment.priceSnapshot = refreshed.priceSnapshot;
          }
          appointment.rescheduleHistory = [...appointment.rescheduleHistory, previous];
        }
        appointment.mutationVersion += 1;
        appointment.updatedAt = stamp();
        return send(response, 200, { success: true, data: { appointment } });
      }
      return send(response, 405, { success: false, code: "METHOD_NOT_ALLOWED", message: "Method not allowed" });
    }
    if (scenario === "catalog-error" && url.pathname.startsWith("/api/v1/")) {
      return send(response, 503, { success: false, code: "TEST_UPSTREAM_UNAVAILABLE", message: "Synthetic test failure" });
    }
    if (request.method === "POST" && url.pathname === "/api/v1/appointments") {
      let body;
      try { body = await readJson(request); } catch { return send(response, 400, { success: false, message: "Invalid JSON" }); }
      const key = request.headers["idempotency-key"];
      if (typeof key !== "string") return send(response, 400, { success: false, message: "Missing idempotency key" });
      if (scenario === "validation") return send(response, 400, { success: false, message: "Synthetic validation failure" });
      if (scenario === "rate-limit") return send(response, 429, { success: false, message: "Synthetic rate limit" }, { "retry-after": "60" });
      if (scenario === "error") return send(response, 503, { success: false, message: "Synthetic provider failure" });
      if (scenario === "conflict" && !conflictReturned) {
        conflictReturned = true;
        return send(response, 409, { success: false, message: "Synthetic slot conflict" });
      }
      const semantic = JSON.stringify({ ...body, challengeToken: undefined });
      const existing = idempotentResults.get(key);
      if (existing && existing.semantic !== semantic) return send(response, 409, { success: false, message: "Synthetic idempotency mismatch" });
      const selectedDentist = managedDentists.find((item) => item._id === body.dentistId) ?? dentist;
      const selectedService = managedServices.find((item) => item._id === body.serviceId) ?? service;
      if (content && !existing) {
        if (!validPatient(body)) return send(response, 400, { success: false, code: 'VALIDATION_ERROR' });
        if (!cleanRelationship(body.dentistId, body.serviceId)) return send(response, 400, { success: false, code: 'VALIDATION_ERROR' });
        const end = endTimeFor(body.startTime, selectedService._id);
        if (!cleanSlotAvailable(body.date, body.startTime, end, body.dentistId)) return send(response, 409, { success: false, code: 'SLOT_UNAVAILABLE' });
      }
      const result = existing?.result || {
        id: content ? idForPreview(800 + appointments.length) : "64b000000000000000000071",
        confirmationCode: content ? `DC-${(800 + appointments.length).toString(16).padStart(16, '0').toUpperCase()}` : "DC-0123456789ABCDEF",
        patientName: body.patientName,
        date: body.date,
        startTime: body.startTime,
        endTime: endTimeFor(body.startTime, selectedService._id),
        status: scenario === "confirmed" || (content && managedClinic.bookingSettings.autoConfirmAppointments) ? "confirmed" : "pending",
        dentist: { id: selectedDentist._id, firstName: selectedDentist.firstName, lastName: selectedDentist.lastName, slug: selectedDentist.slug, translations: selectedDentist.translations },
        service: { id: selectedService._id, name: selectedService.name, slug: selectedService.slug, translations: selectedService.translations, durationMinutes: selectedService.durationMinutes, priceType: selectedService.priceType, priceFrom: selectedService.priceFrom, priceTo: selectedService.priceTo, currency: selectedService.currency },
        price: { priceType: selectedService.priceType, priceFrom: selectedService.priceFrom, priceTo: selectedService.priceTo, currency: selectedService.currency },
      };
      idempotentResults.set(key, { semantic, result });
      if (content && !existing) appointments.push({ ...makeAppointment({ id: result.id, code: result.confirmationCode,
        patientName: body.patientName, patientPhone: canonicalPhone(body.patientPhone), dentistId: body.dentistId, serviceId: body.serviceId,
        date: body.date, startTime: body.startTime, endTime: result.endTime, status: result.status }), source: 'website' });
      return send(response, 201, { success: true, message: "Appointment created successfully", data: { appointment: result } });
    }
    if (request.method !== "GET") return send(response, 405, { success: false, message: "Method not allowed" });
    if (url.pathname === "/api/v1/service-categories") {
      if (scenario === "empty") return send(response, 200, { success: true, data: { categories: [] } });
      return send(response, 200, { success: true, data: { categories: managedCategories.filter((item) => item.isActive) } });
    }
    if (url.pathname === "/api/v1/services") {
      if (scenario === "empty") return send(response, 200, { success: true, data: { services: [] } });
      return send(response, 200, { success: true, data: { services: managedServices.filter((item) => item.isActive) } });
    }
    const publicService = managedServices.find((item) => url.pathname === `/api/v1/services/${item.slug}` && item.isActive);
    if (publicService) return send(response, 200, { success: true, data: { service: publicService } });
    if (url.pathname === "/api/v1/dentists") return send(response, 200, { success: true, data: { dentists: managedDentists.filter((item) => item.isActive && (!url.searchParams.has('bookingEnabled') || item.bookingEnabled === (url.searchParams.get('bookingEnabled') === 'true')) && (!content || !url.searchParams.has('service') || item.services.some((entry) => entry._id === url.searchParams.get('service')))) } });
    const publicDentist = managedDentists.find((item) => url.pathname === `/api/v1/dentists/${item.slug}` && item.isActive);
    if (publicDentist) return send(response, 200, { success: true, data: { dentist: publicDentist } });
    if (url.pathname === "/api/v1/clinic") return send(response, 200, { success: true, data: { clinic: managedClinic } });
    if (url.pathname === "/api/v1/availability") {
      const dentist = managedDentists.find((item) => item._id === url.searchParams.get('dentistId')) ?? testFixtures.dentist;
      const service = managedServices.find((item) => item._id === url.searchParams.get('serviceId')) ?? testFixtures.service;
      const date = url.searchParams.get("date") || "2026-09-10";
      if (content && !cleanDateAllowed(date)) return send(response, 400, { success: false, code: 'VALIDATION_ERROR' });
      if (content && !cleanRelationship(dentist._id, service._id)) return send(response, 400, { success: false, code: 'VALIDATION_ERROR' });
      const empty = scenario === "empty-availability";
      const starts = scenario === "conflict" && conflictReturned ? ["10:30", "12:00"] : ["09:00", "10:30", "12:00", "14:30"];
      const slots = empty ? [] : starts.map((start) => {
        const [hour, minute] = start.split(":").map(Number);
        const endMinutes = hour * 60 + minute + service.durationMinutes;
        const end = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
        return {
          start,
          end,
          startAt: new Date(`${date}T${start}:00+04:00`).toISOString(),
          endAt: new Date(`${date}T${end}:00+04:00`).toISOString(),
        };
      }).filter((slot) => !content || cleanSlotAvailable(date, slot.start, slot.end, dentist._id));
      return send(response, 200, { success: true, data: { availability: {
        date,
        timezone: clinic.timezone,
        available: slots.length > 0,
        reason: slots.length ? null : "FULLY_BOOKED",
        dentist: { id: dentist._id, firstName: dentist.firstName, lastName: dentist.lastName, slug: dentist.slug, translations: dentist.translations },
        service: { id: service._id, name: service.name, slug: service.slug, translations: service.translations, durationMinutes: service.durationMinutes, priceType: service.priceType, priceFrom: service.priceFrom, priceTo: service.priceTo, currency: service.currency },
        rules: { slotIntervalMinutes: 30, bufferMinutes: 0, minBookingNoticeMinutes: 120 },
        slots,
      } } });
    }
    if (url.pathname === "/api/v1/media/gallery") return send(response, 200, { success: true, data: { images: managedGallery.filter((item) => item.isActive) } });
    if (url.pathname === "/api/v1/before-after") {
      const page = Number(url.searchParams.get("page") || "1");
      const limit = Number(url.searchParams.get("limit") || "24");
      if (scenario === "empty") {
        return send(response, 200, { success: true, data: { cases: [], pagination: { page, limit, total: 0, pages: 0 } } });
      }
      const visible = managedBeforeAfter.filter((item) => item.isActive && item.publicationStatus === "published" && item.consentStatus === "active").map(publicBeforeAfter);
      const legacyFixturePaging = visible.length === 2 && visible.some((item) => item._id === beforeAfter._id) && visible.some((item) => item._id === secondBeforeAfter._id);
      const sitemapRead = limit >= 100;
      const pages = legacyFixturePaging && !sitemapRead ? 2 : Math.ceil(visible.length / limit);
      const cases = sitemapRead ? visible : legacyFixturePaging ? (page === 2 ? [visible[1]] : [visible[0]]) : visible.slice((page - 1) * limit, page * limit);
      return send(response, 200, { success: true, data: { cases, pagination: { page, limit, total: legacyFixturePaging ? 25 : visible.length, pages } } });
    }
    const publicCase = managedBeforeAfter.find((item) => url.pathname === `/api/v1/before-after/${item._id}` && item.isActive && item.publicationStatus === "published" && item.consentStatus === "active");
    if (publicCase) return send(response, 200, { success: true, data: { case: publicBeforeAfter(publicCase) } });
    return send(response, 404, { success: false, message: "Not found" });
  });
}
