import type { Metadata } from "next";
import { getClinic, PublicApiError } from "@/api/public-client";
import { clinicView } from "@/api/public-view-models";
import { ClinicDetails } from "@/components/clinic-details";
import { ErrorState, PageIntro } from "@/components/page-shell";
import { isLocale } from "@/i18n/locales";
import { messages } from "@/i18n/messages";
import { publicMetadata } from "@/lib/metadata";

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
  try {
    clinic = clinicView(await getClinic(), locale);
  } catch (error) {
    failed = true;
    requestId = error instanceof PublicApiError ? error.requestId : undefined;
  }
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
            {clinic.description.text && <p lang={clinic.description.lang} className="display-type max-w-4xl border-y py-12 text-3xl leading-[1.35] sm:text-5xl">{clinic.description.text}</p>}
            <div className="pt-16"><ClinicDetails clinic={clinic} locale={locale} /></div>
          </>
        )}
      </div>
    </>
  );
}
