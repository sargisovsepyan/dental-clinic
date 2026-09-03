"use client";

import Link from "next/link";
import type { Route } from "next";
import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Languages } from "lucide-react";
import { isCanonicalSlug, localeNames, locales, switchLocalePath, type Locale } from "@/i18n/locales";
import { cn } from "@/lib/utils";

function LocaleLinks({ locale, label, compact = false }: {
  locale: Locale;
  label: string;
  compact?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const safeQuery = new URLSearchParams();
  const page = searchParams.get("page");
  const service = searchParams.get("service");
  const dentist = searchParams.get("dentist");
  if (page && /^[1-9]\d{0,5}$/.test(page)) safeQuery.set("page", page);
  if (service && isCanonicalSlug(service)) safeQuery.set("service", service);
  if (dentist && isCanonicalSlug(dentist)) safeQuery.set("dentist", dentist);

  return (
    <nav aria-label={label} className={cn("flex items-center gap-1", compact && "flex-col items-stretch")}>
      {!compact && <Languages aria-hidden="true" className="mr-1 size-4 text-muted-foreground" />}
      {locales.map((item) => (
        <Link
          key={item}
          href={`${switchLocalePath(pathname, item)}${safeQuery.size ? `?${safeQuery}` : ""}` as Route}
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

export function LocaleSwitcher(props: {
  locale: Locale;
  label: string;
  compact?: boolean;
}) {
  return <Suspense fallback={null}><LocaleLinks {...props} /></Suspense>;
}
