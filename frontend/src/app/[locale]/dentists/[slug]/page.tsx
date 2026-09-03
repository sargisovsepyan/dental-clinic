import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { getDentist, PublicApiError } from "@/api/public-client";
import { dentistView } from "@/api/public-view-models";
import { PublicImage } from "@/components/public-media";
import { bookingPath, isLocale, localizedPath } from "@/i18n/locales";
import { bookingMessages } from "@/i18n/booking-messages";
import { messages } from "@/i18n/messages";
import { getFrontendEnvironment } from "@/lib/env";
import { publicMetadata } from "@/lib/metadata";

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  try {
    const dentist = dentistView(await getDentist(slug), locale, getFrontendEnvironment().cloudinaryCloudName);
    return publicMetadata({
      locale,
      path: `dentists/${slug}`,
      title: dentist.fullName,
      description: dentist.bio.text || dentist.title.text,
      image: dentist.photo?.src,
      clearImageWhenMissing: true,
    });
  } catch {
    return { robots: { index: false, follow: false } };
  }
}

export default async function DentistDetailPage({ params }: Props) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return null;
  const copy = messages[locale];
  let dentist;
  try {
    dentist = dentistView(await getDentist(slug), locale, getFrontendEnvironment().cloudinaryCloudName);
  } catch (error) {
    if (error instanceof PublicApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <article className="site-container py-12 sm:py-20">
      <Link href={localizedPath(locale, "dentists")} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-primary"><ArrowLeft aria-hidden="true" className="size-4" />{copy.back}</Link>
      <div className="mt-9 grid gap-12 lg:grid-cols-12 lg:gap-16">
        <PublicImage image={dentist.photo} alt={dentist.fullName} lang={dentist.fullNameLang} priority className="aspect-[4/5] min-h-0 rounded-md lg:col-span-5" imageClassName="h-full object-cover" sizes="(max-width: 1024px) 100vw, 42vw" />
        <div className="lg:col-span-7 lg:py-8">
          {dentist.title.text && <p lang={dentist.title.lang} className="eyebrow">{dentist.title.text}</p>}
          <h1 lang={dentist.fullNameLang} className="display-type mt-4 text-balance text-5xl leading-[1.1] sm:text-7xl">{dentist.fullName}</h1>
          {dentist.bio.text && <p lang={dentist.bio.lang} className="mt-8 whitespace-pre-line text-base leading-8 text-muted-foreground">{dentist.bio.text}</p>}
          {dentist.bookingEnabled && dentist.services.some((service) => service.bookingEnabled) && (
            <Link href={bookingPath(locale, { dentist: dentist.slug })} className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90">
              {bookingMessages[locale].nav}<ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          )}
          {dentist.specializations.values.length > 0 && (
            <section className="mt-10 border-t pt-7" aria-labelledby="specializations-heading">
              <h2 id="specializations-heading" className="text-sm font-bold uppercase tracking-[0.12em]">{copy.specializations}</h2>
              <ul lang={dentist.specializations.lang} className="mt-4 flex flex-wrap gap-2">
                {dentist.specializations.values.map((item) => <li key={item} className="rounded-full border px-4 py-2 text-sm">{item}</li>)}
              </ul>
            </section>
          )}
        </div>
      </div>
      {dentist.services.length > 0 && (
        <section className="mt-20 border-t pt-12" aria-labelledby="services-heading">
          <h2 id="services-heading" className="display-type text-4xl">{copy.relatedServices}</h2>
          <div className="mt-8 grid gap-3 md:grid-cols-2">
            {dentist.services.map((service) => (
              <Link key={service.id} href={localizedPath(locale, `services/${service.slug}`)} className="group flex min-h-16 items-center justify-between gap-4 border-b py-4 text-lg font-semibold">
                <span lang={service.name.lang}>{service.name.text}</span><ArrowRight aria-hidden="true" className="size-5 text-primary transition-transform group-hover:translate-x-1" />
              </Link>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
