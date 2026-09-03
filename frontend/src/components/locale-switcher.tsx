"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Languages } from "lucide-react";
import { localeNames, locales, switchLocalePath, type Locale } from "@/i18n/locales";
import { cn } from "@/lib/utils";

export function LocaleSwitcher({ locale, label, compact = false }: {
  locale: Locale;
  label: string;
  compact?: boolean;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label={label} className={cn("flex items-center gap-1", compact && "flex-col items-stretch")}>
      {!compact && <Languages aria-hidden="true" className="mr-1 size-4 text-muted-foreground" />}
      {locales.map((item) => (
        <Link
          key={item}
          href={switchLocalePath(pathname, item)}
          hrefLang={item}
          lang={item}
          aria-current={item === locale ? "page" : undefined}
          className={cn(
            "inline-flex min-h-11 items-center rounded-md px-2.5 text-sm font-medium transition-colors hover:bg-muted",
            compact && "justify-between px-3",
            item === locale ? "bg-secondary text-secondary-foreground" : "text-muted-foreground",
          )}
        >
          {compact ? localeNames[item] : item.toUpperCase()}
        </Link>
      ))}
    </nav>
  );
}
