import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { Locale } from "@/i18n/locales";
import { localizedPath } from "@/i18n/locales";
import { messages } from "@/i18n/messages";
import { bookingMessages } from "@/i18n/booking-messages";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { MobileNavigation } from "@/components/mobile-navigation";

const navItems = [
  ["services", "services"],
  ["dentists", "dentists"],
  ["gallery", "gallery"],
  ["results", "before-after"],
  ["clinic", "clinic"],
] as const;

export function SiteHeader({
  locale,
  clinicName,
  bookingEnabled = false,
}: {
  locale: Locale;
  clinicName?: { text: string; lang?: Locale };
  bookingEnabled?: boolean;
}) {
  const copy = messages[locale];
  const bookingCopy = bookingMessages[locale];
  return (
    <>
      <a
        href="#main-content"
        className="fixed left-4 top-3 z-[100] -translate-y-24 rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-transform focus:translate-y-0"
      >
        {copy.skip}
      </a>
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/86">
        <div className="site-container flex min-h-20 items-center justify-between gap-5">
          <Link href={localizedPath(locale)} className="group flex min-h-11 items-center gap-3" aria-label={copy.home}>
            <span aria-hidden="true" className="grid size-9 place-items-center rounded-full border border-primary/25">
              <span className="size-3 rounded-full bg-primary transition-transform group-hover:scale-75" />
            </span>
            <span lang={clinicName?.lang || (clinicName?.text ? undefined : "en")} className="display-type max-w-44 truncate text-base sm:max-w-64 sm:text-lg">
              {clinicName?.text || "Dental Clinic"}
            </span>
          </Link>
          <nav aria-label={copy.primaryNavigation} className="hidden items-center gap-1 xl:flex">
            {navItems.map(([key, segment]) => (
              <Link
                key={key}
                href={localizedPath(locale, segment)}
                className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                {copy[key]}
              </Link>
            ))}
          </nav>
          <div className="hidden items-center gap-4 xl:flex">
            <LocaleSwitcher locale={locale} label={copy.language} />
            <Link
              href={localizedPath(locale, bookingEnabled ? "book" : "clinic")}
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              {bookingEnabled ? bookingCopy.nav : copy.contactClinic}
              <ArrowUpRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
          <MobileNavigation locale={locale} copy={copy} bookingEnabled={bookingEnabled} />
        </div>
      </header>
    </>
  );
}
