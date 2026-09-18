import Link from "next/link";
import { ArrowRight, MoveDown } from "lucide-react";
import {
  getBeforeAfterCases,
  getClinic,
  getDentists,
  getGallery,
  getServices,
} from "@/api/public-client";
import {
  beforeAfterView,
  clinicView,
  dentistView,
  galleryImageView,
  serviceView,
} from "@/api/public-view-models";
import { BeforeAfterCard } from "@/components/before-after-card";
import { ClinicDetails } from "@/components/clinic-details";
import { DentistCard } from "@/components/dentist-card";
import { ClinicSpace } from '@/components/clinic-space';
import { SectionHeading } from "@/components/page-shell";
import { ServiceCard } from "@/components/service-card";
import { isLocale, localizedPath } from "@/i18n/locales";
import { messages } from "@/i18n/messages";
import { bookingMessages } from "@/i18n/booking-messages";
import { productMessages } from '@/i18n/product-messages';
import { getFrontendEnvironment } from "@/lib/env";
import { publicMetadata } from "@/lib/metadata";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  try {
    const clinic = clinicView(await getClinic(), locale);
    return publicMetadata({
      locale,
      title: clinic.name.text || "Arelis Dental",
      description: clinic.description.text || clinic.tagline.text,
    });
  } catch {
    return publicMetadata({ locale, title: "Arelis Dental" });
  }
}

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  const copy = messages[locale];
  const text = productMessages[locale];
  const bookingCopy = bookingMessages[locale];
  const cloudName = getFrontendEnvironment().cloudinaryCloudName;
  const [clinicResult, servicesResult, dentistsResult, galleryResult, casesResult] = await Promise.allSettled([
    getClinic(),
    getServices({ featured: true }),
    getDentists({ featured: true }),
    getGallery(),
    getBeforeAfterCases({ featured: true, limit: 4 }),
  ]);

  const clinic = clinicResult.status === "fulfilled" ? clinicView(clinicResult.value, locale) : undefined;
  const services = servicesResult.status === "fulfilled"
    ? servicesResult.value.map((item) => serviceView(item, locale, cloudName)).filter((item) => item.name.text)
    : [];
  const dentists = dentistsResult.status === "fulfilled"
    ? dentistsResult.value.map((item) => dentistView(item, locale, cloudName)).filter((item) => item.fullName)
    : [];
  const gallery = galleryResult.status === "fulfilled"
    ? galleryResult.value.slice(0, 4).map((item) => galleryImageView(item, locale, cloudName)).filter((item) => item.alt.text)
    : [];
  const cases = casesResult.status === "fulfilled"
    ? casesResult.value.cases.map((item) => beforeAfterView(item, locale, cloudName)).filter((item) => item.title.text)
    : [];

  return (
    <>
      <section className="relative overflow-hidden border-b">
        <div aria-hidden="true" className="absolute -right-24 top-10 size-[34rem] rounded-full border border-primary/10 sm:right-0" />
        <div aria-hidden="true" className="absolute -right-8 top-28 size-[22rem] rounded-full border border-primary/12 sm:right-24" />
        <div className="site-container relative grid min-h-[38rem] items-center gap-10 py-20 lg:grid-cols-12 lg:py-28">
          <div className="min-w-0 lg:col-span-8">
            <p className="eyebrow">Arelis Dental</p>
            <h1 lang={locale} className={`display-type mt-5 max-w-4xl text-balance break-words leading-[1.08] ${locale === 'hy' ? 'text-[clamp(1.625rem,8.5vw,2rem)] sm:text-[3.5rem] lg:text-[clamp(3.5rem,5.5vw,5rem)]' : 'text-5xl sm:text-7xl lg:text-[5.8rem]'}`}>
              {text.hero}
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">{text.heroBody}</p>
            <div className="mt-9 flex flex-wrap gap-3">
              {clinic?.bookingSettings.isBookingEnabled && (
                <Link href={localizedPath(locale, "book")} className="inline-flex min-h-12 items-center gap-2 rounded-md bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90">
                  {bookingCopy.nav}<ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              )}
              <Link href={localizedPath(locale, "services")} className="inline-flex min-h-12 items-center gap-2 rounded-md bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90">
                {copy.viewServices}<ArrowRight aria-hidden="true" className="size-4" />
              </Link>
              <Link href={localizedPath(locale, "dentists")} className="inline-flex min-h-12 items-center rounded-md border px-5 text-sm font-bold hover:bg-muted">{copy.meetTeam}</Link>
            </div>
          </div>
          <div className="hidden justify-end lg:col-span-4 lg:flex">
            <MoveDown aria-hidden="true" className="size-7 text-primary/60" />
          </div>
        </div>
      </section>

      {services.length > 0 && (
        <section className="section-space">
          <div className="site-container">
            <div className="flex items-end justify-between gap-6">
              <SectionHeading title={copy.featuredServices} />
              <Link href={localizedPath(locale, "services")} className="hidden min-h-11 items-center gap-2 text-sm font-bold text-primary sm:inline-flex">{copy.viewServices}<ArrowRight aria-hidden="true" className="size-4" /></Link>
            </div>
            <div className="mt-12 grid gap-x-10 gap-y-8 lg:grid-cols-2">
              {services.slice(0, 4).map((service) => <ServiceCard key={service.id} service={service} locale={locale} />)}
            </div>
          </div>
        </section>
      )}

      <section className="section-space border-y"><div className="site-container">
        <h2 className="display-type text-4xl">{text.visit}</h2>
        <ol className="mt-8 grid gap-6 md:grid-cols-3">{text.visitSteps.map((step, index) => <li key={step} className="rounded-xl bg-secondary/50 p-6"><span aria-hidden="true" className="text-3xl text-primary">0{index + 1}</span><p className="mt-4 text-lg font-medium">{step}</p></li>)}</ol>
      </div></section>

      {dentists.length > 0 && (
        <section className="section-space bg-muted/55">
          <div className="site-container">
            <SectionHeading title={copy.featuredDentists} />
            <div className="mt-12 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {dentists.slice(0, 5).map((dentist) => <DentistCard key={dentist.id} dentist={dentist} locale={locale} />)}
            </div>
          </div>
        </section>
      )}

      {clinic?.description.text && <section className="section-space border-b"><div className="site-container grid gap-8 lg:grid-cols-12"><h2 className="display-type text-4xl lg:col-span-4">{text.about}</h2><p lang={locale} className="max-w-3xl text-lg leading-8 text-muted-foreground lg:col-span-8">{clinic.description.text}</p></div></section>}
      <div className="site-container"><ClinicSpace images={gallery} locale={locale} /></div>

      {cases.length > 0 && (
        <section className="section-space border-y bg-card">
          <div className="site-container">
            <SectionHeading title={copy.resultsPreview} />
            <div className="mt-12 grid gap-10 lg:grid-cols-3">
              {cases.slice(0, 3).map((item, index) => <BeforeAfterCard key={item.id} item={item} locale={locale} priority={index === 0} />)}
            </div>
          </div>
        </section>
      )}

      {clinic && (
        <section className="section-space">
          <div className="site-container"><ClinicDetails clinic={clinic} locale={locale} /></div>
        </section>
      )}
      {clinic?.bookingSettings.isBookingEnabled && <section className="section-space bg-primary text-primary-foreground"><div className="site-container"><h2 className="display-type text-4xl">{text.finalCta}</h2><p className="mt-4 max-w-xl leading-7">{text.finalCtaBody}</p><Link href={localizedPath(locale, 'book')} className="mt-7 inline-flex min-h-12 items-center rounded-lg bg-background px-6 font-semibold text-primary">{bookingCopy.nav}</Link></div></section>}
    </>
  );
}
