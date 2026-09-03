import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock3 } from "lucide-react";
import type { Metadata } from "next";
import { getDentists, getService, PublicApiError } from "@/api/public-client";
import { dentistView, serviceView } from "@/api/public-view-models";
import { DentistCard } from "@/components/dentist-card";
import { PublicImage } from "@/components/public-media";
import { bookingPath, isLocale, localizedPath } from "@/i18n/locales";
import { bookingMessages } from "@/i18n/booking-messages";
import { messages } from "@/i18n/messages";
import { getFrontendEnvironment } from "@/lib/env";
import { formatPrice } from "@/lib/format";
import { publicMetadata } from "@/lib/metadata";

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  try {
    const service = serviceView(await getService(slug), locale, getFrontendEnvironment().cloudinaryCloudName);
    return publicMetadata({
      locale,
      path: `services/${slug}`,
      title: service.name.text,
      description: service.shortDescription.text || service.description.text,
      image: service.image?.src,
      clearImageWhenMissing: true,
    });
  } catch {
    return { robots: { index: false, follow: false } };
  }
}

export default async function ServiceDetailPage({ params }: Props) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return null;
  const copy = messages[locale];
  const cloudName = getFrontendEnvironment().cloudinaryCloudName;
  let service;
  try {
    service = serviceView(await getService(slug), locale, cloudName);
  } catch (error) {
    if (error instanceof PublicApiError && error.status === 404) notFound();
    throw error;
  }
  if (!service.name.text) notFound();

  let dentists: ReturnType<typeof dentistView>[] = [];
  try {
    dentists = (await getDentists({ service: service.id })).map((item) => dentistView(item, locale, cloudName));
  } catch {
    dentists = [];
  }

  return (
    <>
      <article className="site-container py-12 sm:py-20">
        <Link href={localizedPath(locale, "services")} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-primary"><ArrowLeft aria-hidden="true" className="size-4" />{copy.back}</Link>
        <div className="mt-9 grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-7">
            <p lang={service.category.name.lang} className="eyebrow">{service.category.name.text}</p>
            <h1 lang={service.name.lang} className="display-type mt-4 text-balance text-5xl leading-[1.1] sm:text-7xl">{service.name.text}</h1>
            {service.shortDescription.text && <p lang={service.shortDescription.lang} className="mt-7 text-lg leading-8 text-muted-foreground">{service.shortDescription.text}</p>}
            <div className="mt-9 flex flex-wrap gap-x-8 gap-y-3 border-y py-5 text-sm">
              <span className="font-bold">{formatPrice(locale, copy, service)}</span>
              <span className="inline-flex items-center gap-2 text-muted-foreground"><Clock3 aria-hidden="true" className="size-4" />{copy.duration}: {service.durationMinutes} {copy.minutes}</span>
            </div>
            {service.bookingEnabled && (
              <Link href={bookingPath(locale, { service: service.slug })} className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90">
                {bookingMessages[locale].nav}
              </Link>
            )}
          </div>
          <PublicImage image={service.image} alt={service.name.text} lang={service.name.lang} priority className="aspect-[4/3] min-h-0 rounded-md lg:col-span-5 lg:aspect-auto lg:min-h-[28rem]" imageClassName="h-full object-cover" sizes="(max-width: 1024px) 100vw, 42vw" />
        </div>
        {service.description.text && (
          <div className="grid gap-8 border-b py-16 lg:grid-cols-12">
            <h2 className="display-type text-3xl lg:col-span-4">{copy.learnMore}</h2>
            <p lang={service.description.lang} className="whitespace-pre-line text-base leading-8 text-muted-foreground lg:col-span-7">{service.description.text}</p>
          </div>
        )}
      </article>
      {dentists.length > 0 && (
        <section className="section-space bg-muted/55">
          <div className="site-container">
            <h2 className="display-type text-4xl">{copy.featuredDentists}</h2>
            <div className="mt-10 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {dentists.map((dentist) => <DentistCard key={dentist.id} dentist={dentist} locale={locale} />)}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
