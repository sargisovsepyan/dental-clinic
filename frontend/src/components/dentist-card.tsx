import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Locale } from "@/i18n/locales";
import { localizedPath } from "@/i18n/locales";
import { messages } from "@/i18n/messages";
import { PublicImage } from "@/components/public-media";

type DentistCardView = {
  slug: string;
  fullName: string;
  fullNameLang?: Locale;
  title: { text: string; lang?: Locale };
  specializations: { values: string[]; lang?: Locale };
  photo: { src: string; width: number; height: number } | null;
};

export function DentistCard({
  dentist,
  locale,
  headingLevel = 3,
}: {
  dentist: DentistCardView;
  locale: Locale;
  headingLevel?: 2 | 3;
}) {
  const copy = messages[locale];
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <article className="group">
      <PublicImage image={dentist.photo} alt={dentist.fullName} lang={dentist.fullNameLang} className="aspect-[4/5] min-h-0 rounded-md" imageClassName="h-full object-cover" sizes="(max-width: 768px) 100vw, 33vw" />
      <div className="border-b pb-6 pt-5">
        <Heading lang={dentist.fullNameLang} className="display-type text-2xl">{dentist.fullName}</Heading>
        {dentist.title.text && <p lang={dentist.title.lang} className="mt-2 text-sm text-muted-foreground">{dentist.title.text}</p>}
        {dentist.specializations.values.length > 0 && (
          <p lang={dentist.specializations.lang} className="mt-4 line-clamp-2 text-sm leading-6">
            {dentist.specializations.values.join(" · ")}
          </p>
        )}
        <Link href={localizedPath(locale, `dentists/${dentist.slug}`)} className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-primary">
          {copy.viewDetails}<ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-1" />
        </Link>
      </div>
    </article>
  );
}
