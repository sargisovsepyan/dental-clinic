import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { getBeforeAfterCases, PublicApiError } from "@/api/public-client";
import { beforeAfterView } from "@/api/public-view-models";
import { BeforeAfterCard } from "@/components/before-after-card";
import { EmptyState, ErrorState, PageIntro } from "@/components/page-shell";
import { isLocale, localizedPath } from "@/i18n/locales";
import { messages } from "@/i18n/messages";
import { getFrontendEnvironment } from "@/lib/env";
import { publicMetadata } from "@/lib/metadata";
import { parsePublicPage } from "@/lib/pagination";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const page = parsePublicPage((await searchParams).page);
  if (page === null) return { robots: { index: false, follow: false } };
  const copy = messages[locale];
  const path = page > 1 ? `before-after?page=${page}` : "before-after";
  return publicMetadata({ locale, path, title: copy.results, description: copy.resultsIntro });
}

export default async function BeforeAfterPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  const page = parsePublicPage((await searchParams).page);
  if (page === null) notFound();
  const copy = messages[locale];
  let failed = false;
  let requestId: string | undefined;
  let cases: ReturnType<typeof beforeAfterView>[] = [];
  let pageCount = 0;
  try {
    const cloudName = getFrontendEnvironment().cloudinaryCloudName;
    const result = await getBeforeAfterCases({ page, limit: 24 });
    cases = result.cases.map((item) => beforeAfterView(item, locale, cloudName)).filter((item) => item.title.text);
    pageCount = result.pagination.pages;
  } catch (error) {
    failed = true;
    requestId = error instanceof PublicApiError ? error.requestId : undefined;
  }
  if (!failed && page > 1 && page > pageCount) notFound();

  const status = copy.pageStatus
    .replace("{page}", String(page))
    .replace("{pages}", String(pageCount));
  return (
    <>
      <PageIntro eyebrow={copy.clinic} title={copy.results} description={copy.resultsIntro} />
      <div className="site-container pb-24">
        {failed ? <ErrorState locale={locale} requestId={requestId} /> : cases.length === 0 ? <EmptyState>{copy.noResults}</EmptyState> : (
          <div className="grid gap-14 lg:grid-cols-2">
            {cases.map((item) => <BeforeAfterCard key={item.id} item={item} locale={locale} headingLevel={2} />)}
          </div>
        )}
        {!failed && pageCount > 1 && (
          <nav aria-label={status} className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t pt-6">
            {page > 1 ? (
              <Link href={localizedPath(locale, page === 2 ? "before-after" : `before-after?page=${page - 1}`)} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-primary">
                <ArrowLeft aria-hidden="true" className="size-4" />{copy.previousPage}
              </Link>
            ) : <span />}
            <span className="text-sm text-muted-foreground">{status}</span>
            {page < pageCount ? (
              <Link href={localizedPath(locale, `before-after?page=${page + 1}`)} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-primary">
                {copy.nextPage}<ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            ) : <span />}
          </nav>
        )}
      </div>
    </>
  );
}
