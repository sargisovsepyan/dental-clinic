"use client";
import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import { locales, switchLocalePath, type Locale } from '@/i18n/locales';
import { correctiveMessages } from '@/i18n/corrective-messages';

// Path only: never forward patient filters, credentials or one-time fragments.
export function StaffLanguageSwitcher({ locale, onNavigate }: { locale: Locale; onNavigate?: () => void }) {
  const pathname = usePathname();
  if (/\/(setup-password|reset-password)$/.test(pathname)) return null;
  return <nav aria-label={correctiveMessages[locale].language} className="flex flex-wrap gap-1">
    {locales.map((language) => <Link key={language} prefetch={false} scroll={false}
      href={switchLocalePath(pathname, language) as Route} hrefLang={language} lang={language}
      aria-current={language === locale ? 'page' : undefined} onClick={onNavigate}
      className={`inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium ${language === locale ? 'bg-secondary' : 'hover:bg-muted'}`}>{language.toUpperCase()}</Link>)}
  </nav>;
}
