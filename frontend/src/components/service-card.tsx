import Link from "next/link";
import { ArrowRight, Clock3 } from "lucide-react";
import type { Locale } from "@/i18n/locales";
import { localizedPath } from "@/i18n/locales";
import { messages } from "@/i18n/messages";
import { formatPrice } from "@/lib/format";
import { PublicImage } from "@/components/public-media";

type ServiceCardView = {
  slug: string;
  name: { text: string; lang?: Locale };
  shortDescription: { text: string; lang?: Locale };
  category: { name: { text: string; lang?: Locale } };
  priceType: "fixed" | "from" | "range" | "on_request";
  priceFrom: number | null;
  priceTo: number | null;
  durationMinutes: number;
  image: { src: string; width: number; height: number } | null;
};

export function ServiceCard({ service, locale }: { service: ServiceCardView; locale: Locale }) {
  const copy = messages[locale];
  return (
    <article className="group grid overflow-hidden border-t pt-5 sm:grid-cols-[minmax(0,1fr)_10rem] sm:gap-6">
      <div className="flex min-w-0 flex-col pb-6">
        <p lang={service.category.name.lang} className="eyebrow truncate">{service.category.name.text}</p>
        <h3 lang={service.name.lang} className="display-type mt-3 text-2xl leading-tight">{service.name.text}</h3>
        {service.shortDescription.text && (
          <p lang={service.shortDescription.lang} className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">
            {service.shortDescription.text}
          </p>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-2 pt-5 text-sm">
          <span className="font-semibold">{formatPrice(locale, copy, service)}</span>
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Clock3 aria-hidden="true" className="size-4" />{service.durationMinutes} {copy.minutes}
          </span>
        </div>
        <Link href={localizedPath(locale, `services/${service.slug}`)} className="mt-5 inline-flex min-h-11 w-fit items-center gap-2 text-sm font-bold text-primary">
          {copy.viewDetails}<ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-1" />
        </Link>
      </div>
      <PublicImage image={service.image} alt="" className="order-first mb-5 aspect-[4/3] min-h-0 rounded-md sm:order-none sm:mb-0" imageClassName="h-full object-cover" sizes="(max-width: 640px) 100vw, 160px" />
    </article>
  );
}
