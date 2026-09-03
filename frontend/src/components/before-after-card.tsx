import Link from "next/link";
import type { Locale } from "@/i18n/locales";
import { localizedPath } from "@/i18n/locales";
import { messages } from "@/i18n/messages";
import { PublicImage } from "@/components/public-media";

type CaseView = {
  id: string;
  title: { text: string; lang?: Locale };
  description: { text: string; lang?: Locale };
  beforeImage: { src: string; width: number; height: number } | null;
  afterImage: { src: string; width: number; height: number } | null;
};

export function BeforeAfterCard({
  item,
  locale,
  linked = true,
  headingLevel = 3,
}: {
  item: CaseView;
  locale: Locale;
  linked?: boolean;
  headingLevel?: 1 | 2 | 3;
}) {
  const copy = messages[locale];
  const Heading = headingLevel === 1 ? "h1" : headingLevel === 2 ? "h2" : "h3";
  const content = (
    <article className="group border-t pt-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <figure>
          <figcaption className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{copy.before}</figcaption>
          <PublicImage image={item.beforeImage} alt={`${item.title.text} — ${copy.before}`} lang={item.title.lang} className="aspect-[4/3] min-h-0 rounded-md" imageClassName="h-full object-cover" />
        </figure>
        <figure>
          <figcaption className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{copy.after}</figcaption>
          <PublicImage image={item.afterImage} alt={`${item.title.text} — ${copy.after}`} lang={item.title.lang} className="aspect-[4/3] min-h-0 rounded-md" imageClassName="h-full object-cover" />
        </figure>
      </div>
      <Heading lang={item.title.lang} className="display-type mt-6 text-2xl">{item.title.text}</Heading>
      {item.description.text && <p lang={item.description.lang} className={`mt-3 leading-7 text-muted-foreground ${linked ? "line-clamp-3" : ""}`}>{item.description.text}</p>}
      {linked && <span className="mt-4 inline-flex min-h-11 items-center text-sm font-bold text-primary">{copy.viewDetails}</span>}
    </article>
  );
  return linked ? <Link href={localizedPath(locale, `before-after/${item.id}`)} className="block">{content}</Link> : content;
}
