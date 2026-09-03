import type { Metadata } from "next";
import { getServiceCategories, getServices, PublicApiError } from "@/api/public-client";
import { categoryView, serviceView } from "@/api/public-view-models";
import { EmptyState, ErrorState, PageIntro } from "@/components/page-shell";
import { ServiceCard } from "@/components/service-card";
import { isLocale } from "@/i18n/locales";
import { messages } from "@/i18n/messages";
import { getFrontendEnvironment } from "@/lib/env";
import { publicMetadata } from "@/lib/metadata";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const copy = messages[locale];
  return publicMetadata({ locale, path: "services", title: copy.services, description: copy.servicesIntro });
}

export default async function ServicesPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  const copy = messages[locale];
  const cloudName = getFrontendEnvironment().cloudinaryCloudName;

  let failed = false;
  let requestId: string | undefined;
  let categories: ReturnType<typeof categoryView>[] = [];
  let services: ReturnType<typeof serviceView>[] = [];
  try {
    const [categoryRecords, serviceRecords] = await Promise.all([getServiceCategories(), getServices()]);
    categories = categoryRecords.map((item) => categoryView(item, locale)).filter((item) => item.name.text);
    services = serviceRecords.map((item) => serviceView(item, locale, cloudName)).filter((item) => item.name.text);
  } catch (error) {
    failed = true;
    requestId = error instanceof PublicApiError ? error.requestId : undefined;
  }

  return (
    <>
      <PageIntro eyebrow={copy.clinic} title={copy.services} description={copy.servicesIntro} />
      <div className="site-container pb-24">
        {failed ? <ErrorState locale={locale} requestId={requestId} /> : categories.length === 0 ? <EmptyState>{copy.noServices}</EmptyState> : (
          <div className="grid gap-20">
            {categories.map((category) => {
              const categoryServices = services.filter((service) => service.category.id === category.id);
              return (
                <section key={category.id} aria-labelledby={`category-${category.id}`}>
                  <div className="grid gap-5 border-b pb-7 md:grid-cols-[1fr_2fr]">
                    <h2 id={`category-${category.id}`} lang={category.name.lang} className="display-type text-3xl sm:text-4xl">{category.name.text}</h2>
                    {category.description.text && <p lang={category.description.lang} className="max-w-2xl leading-7 text-muted-foreground">{category.description.text}</p>}
                  </div>
                  {categoryServices.length > 0 ? (
                    <div className="mt-8 grid gap-x-10 gap-y-8 lg:grid-cols-2">
                      {categoryServices.map((service) => <ServiceCard key={service.id} service={service} locale={locale} />)}
                    </div>
                  ) : <p className="py-8 text-sm text-muted-foreground">{copy.noServices}</p>}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
