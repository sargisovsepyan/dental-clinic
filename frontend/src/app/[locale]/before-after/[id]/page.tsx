import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { getBeforeAfterCase, PublicApiError } from "@/api/public-client";
import { beforeAfterView } from "@/api/public-view-models";
import { BeforeAfterCard } from "@/components/before-after-card";
import { isLocale, localizedPath } from "@/i18n/locales";
import { messages } from "@/i18n/messages";
import { getFrontendEnvironment } from "@/lib/env";
import { publicMetadata } from "@/lib/metadata";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  if (!isLocale(locale)) return {};
  try {
    const item = beforeAfterView(await getBeforeAfterCase(id), locale, getFrontendEnvironment().cloudinaryCloudName);
    return publicMetadata({
      locale,
      path: `before-after/${id}`,
      title: item.title.text,
      description: item.description.text,
      image: item.afterImage?.src,
      clearImageWhenMissing: true,
    });
  } catch {
    return { robots: { index: false, follow: false } };
  }
}

export default async function BeforeAfterDetailPage({ params }: Props) {
  const { locale, id } = await params;
  if (!isLocale(locale)) return null;
  const copy = messages[locale];
  let item;
  try {
    item = beforeAfterView(await getBeforeAfterCase(id), locale, getFrontendEnvironment().cloudinaryCloudName);
  } catch (error) {
    if (error instanceof PublicApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }
  if (!item.title.text) notFound();

  return (
    <div className="site-container py-12 sm:py-20">
      <Link href={localizedPath(locale, "before-after")} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-primary"><ArrowLeft aria-hidden="true" className="size-4" />{copy.back}</Link>
      <div className="mt-9 max-w-6xl">
        <BeforeAfterCard item={item} locale={locale} linked={false} headingLevel={1} />
        <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3 border-t pt-6 text-sm text-muted-foreground">
          {item.service && <Link href={localizedPath(locale, `services/${item.service.slug}`)} lang={item.service.name.lang} className="font-semibold text-primary">{item.service.name.text}</Link>}
          {item.dentist && <Link href={localizedPath(locale, `dentists/${item.dentist.slug}`)} lang={item.dentist.fullNameLang} className="font-semibold text-primary">{item.dentist.fullName}</Link>}
        </div>
      </div>
    </div>
  );
}
