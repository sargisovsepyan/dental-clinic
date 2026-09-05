import Link from "next/link";
import type { Route } from "next";
import { ShieldCheck } from "lucide-react";
import type { Locale } from "@/i18n/locales";
import { staffMessages } from "@/i18n/staff-messages";

export function StaffAuthCard({
  locale,
  title,
  intro,
  children,
}: {
  locale: Locale;
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  const copy = staffMessages[locale];
  return (
    <main id="main-content" className="flex min-h-screen items-center justify-center px-5 py-12" tabIndex={-1}>
      <section className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-[var(--shadow-soft)] sm:p-9">
        <Link href={`/${locale}` as Route} className="inline-flex items-center gap-3 text-sm font-semibold text-primary">
          <span className="flex size-10 items-center justify-center rounded-xl bg-secondary"><ShieldCheck aria-hidden="true" className="size-5" /></span>
          {copy.brand}
        </Link>
        <p className="mt-8 text-xs font-bold tracking-[0.16em] text-primary uppercase">{copy.secureArea}</p>
        <h1 className="display-type mt-3 text-3xl leading-tight">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{intro}</p>
        <div className="mt-7">{children}</div>
      </section>
    </main>
  );
}
