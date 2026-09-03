import Link from "next/link";
import { headers } from "next/headers";
import { ArrowLeft } from "lucide-react";
import { isLocale, localizedPath } from "@/i18n/locales";
import { messages } from "@/i18n/messages";

export default async function NotFound() {
  const value = (await headers()).get("x-site-locale") ?? "hy";
  const locale = isLocale(value) ? value : "hy";
  const copy = messages[locale];
  return (
    <main className="grid min-h-[70vh] place-items-center px-5 py-24 text-center">
      <div className="max-w-xl">
        <p className="eyebrow">404</p>
        <h1 className="display-type mt-5 text-5xl sm:text-7xl">{copy.notFoundTitle}</h1>
        <p className="mx-auto mt-6 max-w-md leading-8 text-muted-foreground">{copy.notFoundBody}</p>
        <Link href={localizedPath(locale)} className="mt-9 inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground">
          <ArrowLeft aria-hidden="true" className="size-4" />{copy.home}
        </Link>
      </div>
    </main>
  );
}
