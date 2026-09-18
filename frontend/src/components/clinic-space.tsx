import { PublicImage } from './public-media';
import { productMessages } from '@/i18n/product-messages';
import type { Locale } from '@/i18n/locales';

export function ClinicSpace({ images, locale }: {
  images: { id: string; image: { src: string; width: number; height: number } | null;
    alt: { text: string; lang?: Locale }; caption: { text: string; lang?: Locale } }[];
  locale: Locale;
}) {
  const text = productMessages[locale];
  if (!images.length) return null;
  return <section className="section-space">
    <h2 className="display-type text-4xl">{text.inside}</h2>
    <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">{text.insideIntro}</p>
    <div className="mt-8 grid gap-6 sm:grid-cols-2">
      {images.map((item) => <figure key={item.id}>
        <PublicImage image={item.image} alt={item.alt.text} lang={locale} className="aspect-[3/2] min-h-0 rounded-xl" imageClassName="h-full object-cover" />
        <figcaption lang={locale} className="mt-3 font-medium">{item.caption.text || item.alt.text}</figcaption>
      </figure>)}
    </div>
  </section>;
}
