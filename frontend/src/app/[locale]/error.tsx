"use client";

import { useParams } from "next/navigation";
import { ErrorState } from "@/components/page-shell";
import { isLocale } from "@/i18n/locales";
import { messages } from "@/i18n/messages";

export default function LocaleError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const params = useParams<{ locale?: string }>();
  const locale = params.locale && isLocale(params.locale) ? params.locale : "hy";
  return (
    <div className="site-container py-24">
      <ErrorState locale={locale} />
      <div className="mt-6 text-center">
        <button onClick={reset} className="min-h-11 rounded-md border px-5 text-sm font-semibold hover:bg-muted">
          {messages[locale].retry}
        </button>
      </div>
    </div>
  );
}
