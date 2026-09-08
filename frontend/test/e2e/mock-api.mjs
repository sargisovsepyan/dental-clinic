import http from "node:http";
import { randomUUID } from "node:crypto";

const timestamp = "2026-01-01T00:00:00.000Z";
const image = (name) => ({
  publicId: `tests/${name}`,
  secureUrl: `https://res.cloudinary.com/test-fixture/image/upload/${name}.webp`,
  width: 1200,
  height: 800,
  format: "webp",
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
    hy: { title: "Ատամնաբույժ", bio: "Հրապարակված թեստային կենսագրություն", specializations: ["Թերապիա"] },
    ru: { title: "Стоматолог", bio: "Опубликованная тестовая биография", specializations: ["Терапия"] },
    en: { title: "Dentist", bio: "Published test biography", specializations: ["Therapy"] },
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
};

const previewUsersByEmail = new Map(Object.values(previewAccounts).map((user) => [user.email, user]));

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

export function createMockApiServer(port = 5100, initialScenario = "success") {
  let scenario = allowedScenarios.includes(initialScenario) ? initialScenario : "success";
  let conflictReturned = false;
  let staffConflictReturned = false;
  let appointments = initialAppointments();
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
    return authorization.startsWith("Bearer ") ? accessSessions.get(authorization.slice(7)) || null : null;
  };
  const endTimeFor = (start) => {
    const [hours, minutes] = start.split(":").map(Number);
    const end = hours * 60 + minutes + service.durationMinutes;
    return `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
  };
  const versionConflict = (response, appointment) => send(response, 409, {
    success: false,
    code: "APPOINTMENT_VERSION_CONFLICT",
    message: "Synthetic stale appointment version",
    details: { currentMutationVersion: appointment.mutationVersion },
  });

  return http.createServer(async (request, response) => {
    const url = new URL(request.url || "/", `http://127.0.0.1:${port}`);
    const origin = String(request.headers.origin || "");
    if (origin === frontendOrigin) response.previewCorsOrigin = origin;
    if (request.method === "OPTIONS") {
      if (origin !== frontendOrigin) return send(response, 403, { success: false, message: "Origin not allowed" });
      response.writeHead(204, {
        "access-control-allow-origin": frontendOrigin,
        "access-control-allow-credentials": "true",
        "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
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
      const user = previewUsersByEmail.get(String(body.email || "").trim().toLowerCase());
      if (!user || body.password !== previewPassword) {
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
      await readJson(request).catch(() => ({}));
      return send(response, 202, { success: true, message: "If eligible, instructions were sent" });
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
        if (!body || typeof body.patientName !== "string" || typeof body.patientPhone !== "string" || body.privacyAccepted !== true) {
          return send(response, 400, { success: false, code: "VALIDATION_ERROR", message: "Invalid appointment" });
        }
        const endTime = endTimeFor(body.startTime);
        const created = {
          ...makeAppointment({
            id: "64b000000000000000000079", code: "DC-PREVIEW00000009", status: "pending",
            date: body.date, startTime: body.startTime, endTime,
            patientName: body.patientName, patientPhone: body.patientPhone, patientEmail: body.patientEmail || "",
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
          appointment.updatedAt = new Date().toISOString();
          return versionConflict(response, appointment);
        }
        const date = url.searchParams.get("date") || appointment.date;
        const starts = ["09:00", "12:00", "14:30"];
        const slots = starts.map((start) => {
          const end = endTimeFor(start);
          return { start, end, ...appointmentTimes(date, start, end) };
        });
        return send(response, 200, { success: true, data: { availability: {
          date,
          timezone: clinic.timezone,
          available: true,
          reason: null,
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
          appointment.updatedAt = new Date().toISOString();
          return versionConflict(response, appointment);
        }
        if (action === "status") appointment.status = body.status;
        if (action === "cancel") {
          appointment.status = "cancelled";
          appointment.cancellationReason = body.reason;
          appointment.cancelledAt = new Date().toISOString();
        }
        if (action === "reschedule") {
          const previous = {
            date: appointment.date, startTime: appointment.startTime, endTime: appointment.endTime,
            dentist: appointment.dentist, service: appointment.service, reason: body.reason || "",
          };
          appointment.date = body.date;
          appointment.startTime = body.startTime;
          appointment.endTime = endTimeFor(body.startTime);
          Object.assign(appointment, appointmentTimes(appointment.date, appointment.startTime, appointment.endTime));
          appointment.dentist = body.dentistId || appointment.dentist;
          appointment.service = body.serviceId || appointment.service;
          appointment.rescheduleHistory = [...appointment.rescheduleHistory, previous];
        }
        appointment.mutationVersion += 1;
        appointment.updatedAt = new Date().toISOString();
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
      const result = existing?.result || {
        id: "64b000000000000000000071",
        confirmationCode: "DC-0123456789ABCDEF",
        patientName: body.patientName,
        date: body.date,
        startTime: body.startTime,
        endTime: body.startTime === "10:30" ? "11:30" : "10:00",
        status: scenario === "confirmed" ? "confirmed" : "pending",
        dentist: { id: dentist._id, firstName: dentist.firstName, lastName: dentist.lastName, slug: dentist.slug, translations: dentist.translations },
        service: { id: service._id, name: service.name, slug: service.slug, translations: service.translations, durationMinutes: service.durationMinutes, priceType: service.priceType, priceFrom: service.priceFrom, priceTo: service.priceTo, currency: service.currency },
        price: { priceType: service.priceType, priceFrom: service.priceFrom, priceTo: service.priceTo, currency: service.currency },
      };
      idempotentResults.set(key, { semantic, result });
      return send(response, 201, { success: true, message: "Appointment created successfully", data: { appointment: result } });
    }
    if (request.method !== "GET") return send(response, 405, { success: false, message: "Method not allowed" });
    if (url.pathname === "/api/v1/service-categories") {
      if (scenario === "empty") return send(response, 200, { success: true, data: { categories: [] } });
      return send(response, 200, { success: true, data: { categories: [category] } });
    }
    if (url.pathname === "/api/v1/services") {
      if (scenario === "empty") return send(response, 200, { success: true, data: { services: [] } });
      return send(response, 200, { success: true, data: { services: [service] } });
    }
    if (url.pathname === `/api/v1/services/${service.slug}`) return send(response, 200, { success: true, data: { service } });
    if (url.pathname === "/api/v1/dentists") return send(response, 200, { success: true, data: { dentists: [dentist] } });
    if (url.pathname === `/api/v1/dentists/${dentist.slug}`) return send(response, 200, { success: true, data: { dentist } });
    if (url.pathname === "/api/v1/clinic") return send(response, 200, { success: true, data: { clinic } });
    if (url.pathname === "/api/v1/availability") {
      const date = url.searchParams.get("date") || "2026-09-10";
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
      });
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
    if (url.pathname === "/api/v1/media/gallery") return send(response, 200, { success: true, data: { images: [galleryImage] } });
    if (url.pathname === "/api/v1/before-after") {
      const page = Number(url.searchParams.get("page") || "1");
      const limit = Number(url.searchParams.get("limit") || "24");
      if (scenario === "empty") {
        return send(response, 200, { success: true, data: { cases: [], pagination: { page, limit, total: 0, pages: 0 } } });
      }
      const sitemapRead = limit >= 100;
      const pages = sitemapRead ? 1 : 2;
      const cases = sitemapRead ? [beforeAfter, secondBeforeAfter] : page === 2 ? [secondBeforeAfter] : [beforeAfter];
      return send(response, 200, { success: true, data: { cases, pagination: { page, limit, total: 25, pages } } });
    }
    if (url.pathname === `/api/v1/before-after/${beforeAfter._id}`) return send(response, 200, { success: true, data: { case: beforeAfter } });
    if (url.pathname === `/api/v1/before-after/${secondBeforeAfter._id}`) return send(response, 200, { success: true, data: { case: secondBeforeAfter } });
    return send(response, 404, { success: false, message: "Not found" });
  });
}
