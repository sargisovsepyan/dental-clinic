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

function send(response, status, body, headers = {}) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "x-request-id": randomUUID(),
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-expose-headers": "Retry-After, X-Request-Id",
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
  const idempotentResults = new Map();

  return http.createServer(async (request, response) => {
    const url = new URL(request.url || "/", `http://127.0.0.1:${port}`);
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "Content-Type, Idempotency-Key",
        "access-control-max-age": "600",
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
      idempotentResults.clear();
      return send(response, 200, { success: true, data: { scenario } });
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
