import type { Metadata } from "next";
import {
  getBookingClinic,
  getBookingDentists,
  getBookingServices,
} from "@/api/public-client";
import { clinicView, dentistView, serviceView } from "@/api/public-view-models";
import { BookingFlow } from "@/components/booking-flow";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { bookingMessages } from "@/i18n/booking-messages";
import { isCanonicalSlug, isLocale } from "@/i18n/locales";
import { getFrontendEnvironment } from "@/lib/env";
import { publicMetadata } from "@/lib/metadata";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ service?: string | string[]; dentist?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const copy = bookingMessages[locale];
  return publicMetadata({ locale, path: "book", title: copy.nav, description: copy.intro });
}

export default async function BookingPage({ params, searchParams }: Props) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) return null;
  const copy = bookingMessages[locale];
  const environment = getFrontendEnvironment();
  let data;
  try {
    const [serviceRecords, dentistRecords, clinicRecord] = await Promise.all([
      getBookingServices(),
      getBookingDentists(),
      getBookingClinic(),
    ]);
    const clinic = clinicView(clinicRecord, locale);
    const services = serviceRecords
      .map((item) => serviceView(item, locale, environment.cloudinaryCloudName))
      .filter((item) => item.bookingEnabled && item.name.text)
      .map((item) => ({
        id: item.id,
        slug: item.slug,
        name: item.name,
        shortDescription: item.shortDescription,
        durationMinutes: item.durationMinutes,
      }));
    const bookingServiceIds = new Set(services.map((item) => item.id));
    const dentists = dentistRecords
      .map((item) => dentistView(item, locale, environment.cloudinaryCloudName))
      .filter((item) => item.bookingEnabled)
      .map((item) => ({
        id: item.id,
        slug: item.slug,
        fullName: item.fullName,
        fullNameLang: item.fullNameLang,
        title: item.title,
        serviceIds: item.services
          .filter((service) => service.bookingEnabled && bookingServiceIds.has(service.id))
          .map((service) => service.id),
      }))
      .filter((item) => item.serviceIds.length > 0);
    data = { services, dentists, clinic };
  } catch {
    data = undefined;
  }

  const serviceQuery = typeof query.service === "string" && isCanonicalSlug(query.service)
    ? query.service
    : undefined;
  const dentistQuery = typeof query.dentist === "string" && isCanonicalSlug(query.dentist)
    ? query.dentist
    : undefined;

  return (
    <section className="site-container py-12 sm:py-20">
      <div className="max-w-3xl">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 className="display-type mt-4 text-balance text-5xl leading-[1.08] sm:text-7xl">{copy.title}</h1>
        <p className="mt-6 text-lg leading-8 text-muted-foreground">{copy.intro}</p>
      </div>
      <div className="mt-12">
        {!data || !data.clinic.bookingSettings.isBookingEnabled || data.services.length === 0 || data.dentists.length === 0 ? (
          <Alert className="max-w-2xl p-5">
            <AlertTitle>{copy.bookingUnavailable}</AlertTitle>
            <AlertDescription>{copy.bookingUnavailableBody}</AlertDescription>
          </Alert>
        ) : (
          <BookingFlow
            locale={locale}
            services={data.services}
            dentists={data.dentists}
            clinic={{
              timezone: data.clinic.timezone,
              requireEmail: data.clinic.bookingSettings.requireEmail,
              allowSameDayBooking: data.clinic.bookingSettings.allowSameDayBooking,
              maxBookingDaysAhead: data.clinic.bookingSettings.maxBookingDaysAhead,
            }}
            challenge={environment.bookingChallenge}
            initialServiceSlug={serviceQuery}
            initialDentistSlug={dentistQuery}
          />
        )}
      </div>
    </section>
  );
}
