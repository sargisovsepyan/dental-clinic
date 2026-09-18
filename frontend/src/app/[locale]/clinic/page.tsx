import type { Metadata } from "next";
import { getClinic, getGallery, PublicApiError } from "@/api/public-client";
import { clinicView, galleryImageView } from "@/api/public-view-models";
import { ClinicDetails } from "@/components/clinic-details";
import { ErrorState, PageIntro } from "@/components/page-shell";
import { isLocale } from "@/i18n/locales";
import { messages } from "@/i18n/messages";
import { publicMetadata } from "@/lib/metadata";
import { getFrontendEnvironment } from '@/lib/env';
import { ClinicSpace } from '@/components/clinic-space';
import { productMessages } from '@/i18n/product-messages';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const copy = messages[locale];
  try {
    const clinic = clinicView(await getClinic(), locale);
    return publicMetadata({ locale, path: "clinic", title: copy.clinic, description: clinic.description.text || copy.clinicIntro });
  } catch {
    return publicMetadata({ locale, path: "clinic", title: copy.clinic, description: copy.clinicIntro });
  }
}

export default async function ClinicPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  const copy = messages[locale];
  let failed = false;
  let requestId: string | undefined;
  let clinic: ReturnType<typeof clinicView> | undefined;
  let images: ReturnType<typeof galleryImageView>[] = [];
  try {
    clinic = clinicView(await getClinic(), locale);
  } catch (error) {
    failed = true;
    requestId = error instanceof PublicApiError ? error.requestId : undefined;
  }
  try { images = (await getGallery()).slice(0, 4).map((image) => galleryImageView(image, locale, getFrontendEnvironment().cloudinaryCloudName)).filter((image) => image.alt.text); } catch { /* Contact information remains useful when gallery is unavailable. */ }
  return (
    <>
      <PageIntro
        eyebrow={copy.clinic}
        title={clinic?.name.text || copy.clinic}
        titleLang={clinic?.name.lang}
        description={clinic?.tagline.text || copy.clinicIntro}
        descriptionLang={clinic?.tagline.text ? clinic.tagline.lang : locale}
      />
      <div className="site-container pb-24">
        {failed || !clinic ? <ErrorState locale={locale} requestId={requestId} /> : (
          <>
            <section className="border-y py-10"><h2 className="display-type text-3xl">{productMessages[locale].about}</h2>{clinic.description.text && <p lang={locale} className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">{clinic.description.text}</p>}</section>
            <ClinicSpace images={images} locale={locale} />
            <div className="pt-16"><ClinicDetails clinic={clinic} locale={locale} /></div>
          </>
        )}
      </div>
    </>
  );
}
