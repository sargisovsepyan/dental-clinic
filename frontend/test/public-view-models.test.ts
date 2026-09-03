import { describe, expect, it } from "vitest";
import type {
  BeforeAfterRecord,
  ClinicRecord,
  DentistRecord,
  GalleryImageRecord,
  ServiceCategoryRecord,
  ServiceRecord,
} from "@/api/public-client";
import {
  beforeAfterView,
  categoryView,
  clinicView,
  dentistView,
  galleryImageView,
  serviceView,
} from "@/api/public-view-models";

const image = {
  publicId: "tests/example",
  secureUrl: "https://res.cloudinary.com/clinic/image/upload/tests/example.webp",
  width: 1200,
  height: 800,
  format: "webp",
  bytes: 1_000,
};

describe("public view models", () => {
  it("allowlists display fields even when an upstream object contains governance data", () => {
    const record = {
      _id: "64b000000000000000000051",
      title: "Case",
      description: "",
      translations: { hy: { title: "Դեպք", description: "" } },
      service: null,
      dentist: null,
      beforeImage: image,
      afterImage: image,
      isFeatured: false,
      isActive: true,
      sortOrder: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      consentStatus: "active",
      externalConsentReference: "PRIVATE-CONSENT-REFERENCE",
    } as BeforeAfterRecord & {
      consentStatus: string;
      externalConsentReference: string;
    };

    const view = beforeAfterView(record, "en", undefined);
    expect(view.title).toEqual({ text: "Դեպք", lang: "hy" });
    expect(view.beforeImage).toBeNull();
    expect(view).not.toHaveProperty("consentStatus");
    expect(view).not.toHaveProperty("externalConsentReference");
    expect(JSON.stringify(view)).not.toContain("PRIVATE-CONSENT-REFERENCE");
  });

  it("maps every public resource through explicit localized display fields", () => {
    const translations = {
      hy: {
        name: "Հայերեն անուն",
        description: "Հայերեն նկարագրություն",
        shortDescription: "Կարճ",
        title: "Բժիշկ",
        bio: "Կենսագրություն",
        specializations: ["Թերապիա", 42],
        clinicName: "Կլինիկա",
        tagline: "Կարգախոս",
        address: "Երևան",
        altText: "Պատկերի նկարագրություն",
        caption: "Մակագրություն",
      },
      en: {
        name: "English name",
        description: "English description",
        shortDescription: "Short",
        title: "Dentist",
        bio: "Biography",
        specializations: ["Therapy"],
        clinicName: "Clinic",
        tagline: "Tagline",
        address: "Yerevan",
        altText: "Image description",
        caption: "Caption",
      },
    };
    const category = {
      _id: "category-id",
      slug: "therapy",
      translations,
    } as unknown as ServiceCategoryRecord;
    const service = {
      _id: "service-id",
      slug: "cleaning",
      translations,
      category,
      priceType: "from",
      priceFrom: 20_000,
      priceTo: null,
      currency: "AMD",
      durationMinutes: 60,
      bookingEnabled: true,
      image,
    } as unknown as ServiceRecord;
    const dentist = {
      _id: "dentist-id",
      slug: "ani-test",
      firstName: "Անի",
      lastName: "Փորձարկում",
      translations,
      photo: image,
      services: [service],
      bookingEnabled: true,
    } as unknown as DentistRecord;
    const clinic = {
      _id: "clinic-id",
      translations,
      phone: "+37410123456",
      secondaryPhone: "",
      email: "clinic@example.test",
      mapUrl: "https://maps.example.test/clinic",
      socialLinks: {},
      weeklySchedule: [],
      timezone: "Asia/Yerevan",
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
    } as unknown as ClinicRecord;
    const galleryImage = {
      _id: "gallery-id",
      image,
      translations,
    } as unknown as GalleryImageRecord;
    const beforeAfter = {
      _id: "case-id",
      translations,
      beforeImage: image,
      afterImage: image,
      service,
      dentist,
    } as unknown as BeforeAfterRecord;

    expect(categoryView(category, "en").name).toEqual({ text: "English name", lang: "en" });
    expect(serviceView(service, "en", "clinic").image?.src).toContain("res.cloudinary.com/clinic/");
    expect(dentistView(dentist, "en", "clinic")).toMatchObject({
      fullName: "Անի Փորձարկում",
      fullNameLang: "hy",
      specializations: { values: ["Therapy"], lang: "en" },
      services: [{ id: "service-id", slug: "cleaning" }],
      bookingEnabled: true,
    });
    expect(clinicView(clinic, "en")).toMatchObject({ phone: "+37410123456", timezone: "Asia/Yerevan", bookingSettings: { isBookingEnabled: true, requireEmail: false } });
    expect(galleryImageView(galleryImage, "en", "clinic").alt.text).toBe("Image description");
    expect(beforeAfterView(beforeAfter, "en", "clinic")).toMatchObject({
      service: { id: "service-id", slug: "cleaning" },
      dentist: { id: "dentist-id", slug: "ani-test", fullName: "Անի Փորձարկում", fullNameLang: "hy" },
    });
  });
});
