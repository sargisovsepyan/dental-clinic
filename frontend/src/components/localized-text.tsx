import type { Locale } from "@/i18n/locales";
import { cn } from "@/lib/utils";

export function LocalizedText({
  text,
  lang,
  as: Component = "span",
  className,
}: {
  text: string;
  lang?: Locale;
  as?: "span" | "p" | "h1" | "h2" | "h3";
  className?: string;
}) {
  return (
    <Component lang={lang} className={cn(className)}>
      {text}
    </Component>
  );
}
