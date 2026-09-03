import type { Metadata } from "next";
import { getGallery, PublicApiError } from "@/api/public-client";
import { galleryImageView } from "@/api/public-view-models";
import { EmptyState, ErrorState, PageIntro } from "@/components/page-shell";
import { PublicImage } from "@/components/public-media";
import { isLocale } from "@/i18n/locales";
import { messages } from "@/i18n/messages";
import { getFrontendEnvironment } from "@/lib/env";
import { publicMetadata } from "@/lib/metadata";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const copy = messages[locale];
  return publicMetadata({ locale, path: "gallery", title: copy.gallery, description: copy.galleryIntro });
}

export default async function GalleryPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  const copy = messages[locale];
  let failed = false;
  let requestId: string | undefined;
  let images: ReturnType<typeof galleryImageView>[] = [];
  try {
    const cloudName = getFrontendEnvironment().cloudinaryCloudName;
    images = (await getGallery())
      .map((item) => galleryImageView(item, locale, cloudName))
      .filter((item) => item.alt.text);
  } catch (error) {
    failed = true;
    requestId = error instanceof PublicApiError ? error.requestId : undefined;
  }
  return (
    <>
      <PageIntro eyebrow={copy.clinic} title={copy.gallery} description={copy.galleryIntro} />
      <div className="site-container pb-24">
        {failed ? <ErrorState locale={locale} requestId={requestId} /> : images.length === 0 ? <EmptyState>{copy.noGallery}</EmptyState> : (
          <div className="grid items-start gap-x-5 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
            {images.map((item) => (
              <figure key={item.id}>
                <PublicImage image={item.image} alt={item.alt.text} lang={item.alt.lang} className="aspect-[4/3] min-h-0 rounded-md" imageClassName="h-full object-cover" sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" />
                {item.caption.text && <figcaption lang={item.caption.lang} className="mt-3 text-sm leading-6 text-muted-foreground">{item.caption.text}</figcaption>}
              </figure>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
