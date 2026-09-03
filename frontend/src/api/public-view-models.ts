import type {
  BeforeAfterRecord,
  ClinicRecord,
  DentistRecord,
  GalleryImageRecord,
  ServiceCategoryRecord,
  ServiceRecord,
} from "@/api/public-client";
import { selectLocalizedField, type LocalizedValue } from "@/i18n/localized-content";
import type { Locale } from "@/i18n/locales";
import { safeManagedImage } from "@/lib/safe-urls";

export interface SafeImageView {
  src: string;
  width: number;
  height: number;
}

export interface LocalizedTextView {
  text: string;
  lang?: Locale;
}

type CategorySummary = Pick<ServiceCategoryRecord, "_id" | "slug" | "translations">;

function textView(value: LocalizedValue<unknown>): LocalizedTextView {
  return {
    text: typeof value.value === "string" ? value.value : "",
    lang: value.resolvedLocale,
  };
}

function listView(value: LocalizedValue<unknown>) {
  return {
    values: Array.isArray(value.value)
      ? value.value.filter((item): item is string => typeof item === "string")
      : [],
    lang: value.resolvedLocale,
  };
}

function primaryTextLanguage(value: string): Locale | undefined {
  return /\p{Script=Armenian}/u.test(value) ? "hy" : undefined;
}

export function categoryView(category: CategorySummary, locale: Locale) {
  return {
    id: category._id,
    slug: category.slug,
    name: textView(selectLocalizedField(category.translations, locale, "name")),
    description: textView(selectLocalizedField(category.translations, locale, "description")),
  };
}

export function serviceView(
  service: ServiceRecord,
  locale: Locale,
  cloudinaryCloudName?: string,
) {
  return {
    id: service._id,
    slug: service.slug,
    name: textView(selectLocalizedField(service.translations, locale, "name")),
    shortDescription: textView(
      selectLocalizedField(service.translations, locale, "shortDescription"),
    ),
    description: textView(selectLocalizedField(service.translations, locale, "description")),
    category: categoryView(service.category, locale),
    priceType: service.priceType,
    priceFrom: service.priceFrom,
    priceTo: service.priceTo,
    currency: service.currency,
    durationMinutes: service.durationMinutes,
    bookingEnabled: service.bookingEnabled,
    image: safeManagedImage(service.image, cloudinaryCloudName),
  };
}

export function dentistView(
  dentist: DentistRecord,
  locale: Locale,
  cloudinaryCloudName?: string,
) {
  const fullName = `${dentist.firstName} ${dentist.lastName}`.trim();
  return {
    id: dentist._id,
    slug: dentist.slug,
    firstName: dentist.firstName,
    lastName: dentist.lastName,
    fullName,
    fullNameLang: primaryTextLanguage(fullName),
    title: textView(selectLocalizedField(dentist.translations, locale, "title")),
    bio: textView(selectLocalizedField(dentist.translations, locale, "bio")),
    specializations: listView(
      selectLocalizedField(dentist.translations, locale, "specializations"),
    ),
    photo: safeManagedImage(dentist.photo, cloudinaryCloudName),
    bookingEnabled: dentist.bookingEnabled,
    services: dentist.services.map((service) => ({
      id: service._id,
      slug: service.slug,
      name: textView(selectLocalizedField(service.translations, locale, "name")),
      bookingEnabled: service.bookingEnabled,
    })),
  };
}

export function clinicView(clinic: ClinicRecord, locale: Locale) {
  return {
    id: clinic._id,
    name: textView(selectLocalizedField(clinic.translations, locale, "clinicName")),
    tagline: textView(selectLocalizedField(clinic.translations, locale, "tagline")),
    description: textView(selectLocalizedField(clinic.translations, locale, "description")),
    address: textView(selectLocalizedField(clinic.translations, locale, "address")),
    phone: clinic.phone,
    secondaryPhone: clinic.secondaryPhone,
    email: clinic.email,
    mapUrl: clinic.mapUrl,
    socialLinks: clinic.socialLinks,
    weeklySchedule: clinic.weeklySchedule,
    timezone: clinic.timezone,
    bookingSettings: {
      isBookingEnabled: clinic.bookingSettings.isBookingEnabled,
      minBookingNoticeMinutes: clinic.bookingSettings.minBookingNoticeMinutes,
      maxBookingDaysAhead: clinic.bookingSettings.maxBookingDaysAhead,
      allowSameDayBooking: clinic.bookingSettings.allowSameDayBooking,
      requireEmail: clinic.bookingSettings.requireEmail,
      autoConfirmAppointments: clinic.bookingSettings.autoConfirmAppointments,
    },
  };
}

export function galleryImageView(
  image: GalleryImageRecord,
  locale: Locale,
  cloudinaryCloudName?: string,
) {
  return {
    id: image._id,
    image: safeManagedImage(image.image, cloudinaryCloudName),
    alt: textView(selectLocalizedField(image.translations, locale, "altText")),
    caption: textView(selectLocalizedField(image.translations, locale, "caption")),
  };
}

export function beforeAfterView(
  item: BeforeAfterRecord,
  locale: Locale,
  cloudinaryCloudName?: string,
) {
  return {
    id: item._id,
    title: textView(selectLocalizedField(item.translations, locale, "title")),
    description: textView(selectLocalizedField(item.translations, locale, "description")),
    beforeImage: safeManagedImage(item.beforeImage, cloudinaryCloudName),
    afterImage: safeManagedImage(item.afterImage, cloudinaryCloudName),
    service: item.service
      ? {
          id: item.service._id,
          slug: item.service.slug,
          name: textView(selectLocalizedField(item.service.translations, locale, "name")),
        }
      : null,
    dentist: item.dentist
      ? {
          id: item.dentist._id,
          slug: item.dentist.slug,
          fullName: `${item.dentist.firstName} ${item.dentist.lastName}`.trim(),
          fullNameLang: primaryTextLanguage(`${item.dentist.firstName} ${item.dentist.lastName}`.trim()),
        }
      : null,
  };
}
