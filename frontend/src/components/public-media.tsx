"use client";

import Image from "next/image";
import { ImageIcon } from "lucide-react";
import { useState } from "react";
import type { SafeImageView } from "@/api/public-view-models";
import type { Locale } from "@/i18n/locales";
import { cn } from "@/lib/utils";
import { productMessages } from '@/i18n/product-messages';

function Placeholder({ alt, lang, className }: { alt: string; lang?: Locale; className?: string }) {
  return (
    <div
      className={cn("grid min-h-56 place-items-center overflow-hidden bg-secondary", className)}
      lang={lang}
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
    >
      <div className="relative grid size-24 place-items-center rounded-full border border-primary/18">
        <div className="absolute inset-4 rounded-full border border-primary/14" />
        <ImageIcon className="size-5 text-primary/52" />
      </div>
    </div>
  );
}

function ManagedImage({ image, alt, lang, className, imageClassName, priority, sizes }: {
  image: SafeImageView;
  alt: string;
  lang?: Locale;
  className?: string;
  imageClassName?: string;
  priority: boolean;
  sizes: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return <Placeholder alt={alt} lang={lang} className={className} />;
  return (
    <div lang={lang} className={cn("relative overflow-hidden bg-muted", className)}>
      <Image
        src={image.src}
        width={image.width}
        height={image.height}
        alt={alt}
        priority={priority}
        loading={image.src.startsWith("/") ? "eager" : undefined}
        sizes={sizes}
        unoptimized={image.src.startsWith("/")}
        className={cn("h-auto w-full", imageClassName)}
        onError={() => setFailed(true)}
      />
      {image.src.startsWith('/illustrations/') && <p className="absolute inset-x-0 bottom-0 bg-background/90 px-3 py-2 text-xs text-muted-foreground">{productMessages[lang || 'hy'].illustration}</p>}
    </div>
  );
}

export function PublicImage({
  image,
  alt,
  lang,
  className,
  imageClassName,
  priority = false,
  sizes = "(max-width: 768px) 100vw, 50vw",
}: {
  image: SafeImageView | null;
  alt: string;
  lang?: Locale;
  className?: string;
  imageClassName?: string;
  priority?: boolean;
  sizes?: string;
}) {
  if (!image) {
    return <Placeholder alt={alt} lang={lang} className={className} />;
  }
  return <ManagedImage key={image.src} image={image} alt={alt} lang={lang} className={className} imageClassName={imageClassName} priority={priority} sizes={sizes} />;
}
