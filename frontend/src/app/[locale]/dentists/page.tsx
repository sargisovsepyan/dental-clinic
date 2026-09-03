import type { Metadata } from "next";
import { getDentists, PublicApiError } from "@/api/public-client";
import { dentistView } from "@/api/public-view-models";
import { DentistCard } from "@/components/dentist-card";
import { EmptyState, ErrorState, PageIntro } from "@/components/page-shell";
import { isLocale } from "@/i18n/locales";
import { messages } from "@/i18n/messages";
import { getFrontendEnvironment } from "@/lib/env";
import { publicMetadata } from "@/lib/metadata";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const copy = messages[locale];
  return publicMetadata({ locale, path: "dentists", title: copy.dentists, description: copy.dentistsIntro });
}

export default async function DentistsPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  const copy = messages[locale];
  let failed = false;
  let requestId: string | undefined;
  let dentists: ReturnType<typeof dentistView>[] = [];
  try {
    const cloudName = getFrontendEnvironment().cloudinaryCloudName;
    dentists = (await getDentists()).map((item) => dentistView(item, locale, cloudName));
  } catch (error) {
    failed = true;
    requestId = error instanceof PublicApiError ? error.requestId : undefined;
  }
  return (
    <>
      <PageIntro eyebrow={copy.clinic} title={copy.dentists} description={copy.dentistsIntro} />
      <div className="site-container pb-24">
        {failed ? <ErrorState locale={locale} requestId={requestId} /> : dentists.length === 0 ? <EmptyState>{copy.noDentists}</EmptyState> : (
          <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-3">
            {dentists.map((dentist) => <DentistCard key={dentist.id} dentist={dentist} locale={locale} headingLevel={2} />)}
          </div>
        )}
      </div>
    </>
  );
}
