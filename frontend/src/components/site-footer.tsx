import Link from "next/link";
import { ExternalLink, Mail, Phone } from "lucide-react";
import type { Locale } from "@/i18n/locales";
import { localizedPath } from "@/i18n/locales";
import { messages } from "@/i18n/messages";
import { safeEmailHref, safePhoneHref, safeSocialUrl, type SocialPlatform } from "@/lib/safe-urls";

const platforms: SocialPlatform[] = ["instagram", "facebook", "whatsapp", "telegram"];

export function SiteFooter({
  locale,
  clinic,
}: {
  locale: Locale;
  clinic?: {
    name: { text: string; lang?: Locale };
    address: { text: string; lang?: Locale };
    phone: string;
    email: string;
    socialLinks: Record<string, string | undefined>;
  };
}) {
  const copy = messages[locale];
  const phone = safePhoneHref(clinic?.phone);
  const email = safeEmailHref(clinic?.email);
  const social = platforms
    .map((platform) => ({ platform, href: safeSocialUrl(platform, clinic?.socialLinks[platform]) }))
    .filter((item): item is { platform: SocialPlatform; href: string } => Boolean(item.href));

  return (
    <footer className="border-t bg-foreground text-background">
      <div className="site-container grid gap-12 py-14 md:grid-cols-[1.2fr_1fr_1fr] md:py-20">
        <div>
          <Link href={localizedPath(locale)} className="display-type text-2xl">
            <span lang={clinic?.name.lang}>{clinic?.name.text || "Dental Clinic"}</span>
          </Link>
          {clinic?.address.text && <p lang={clinic.address.lang} className="mt-5 max-w-sm text-sm leading-7 text-background/68">{clinic.address.text}</p>}
        </div>
        <nav aria-label={copy.footerNavigation} className="grid content-start gap-2 text-sm">
          <Link className="min-h-10 py-2 text-background/72 hover:text-background" href={localizedPath(locale, "services")}>{copy.services}</Link>
          <Link className="min-h-10 py-2 text-background/72 hover:text-background" href={localizedPath(locale, "dentists")}>{copy.dentists}</Link>
          <Link className="min-h-10 py-2 text-background/72 hover:text-background" href={localizedPath(locale, "gallery")}>{copy.gallery}</Link>
          <Link className="min-h-10 py-2 text-background/72 hover:text-background" href={localizedPath(locale, "before-after")}>{copy.results}</Link>
        </nav>
        <div className="grid content-start gap-2 text-sm">
          {phone && <a className="flex min-h-10 items-center gap-3 text-background/72 hover:text-background" href={phone}><Phone aria-hidden="true" className="size-4" />{clinic?.phone}</a>}
          {email && <a className="flex min-h-10 items-center gap-3 break-all text-background/72 hover:text-background" href={email}><Mail aria-hidden="true" className="size-4" />{clinic?.email}</a>}
          {social.map(({ platform, href }) => (
            <a key={platform} href={href} target="_blank" rel="noopener noreferrer" className="flex min-h-10 items-center gap-3 capitalize text-background/72 hover:text-background">
              <ExternalLink aria-hidden="true" className="size-4" />{platform}
            </a>
          ))}
        </div>
      </div>
      <div className="site-container border-t border-background/15 py-6 text-xs text-background/55">
        © {new Date().getUTCFullYear()} <span lang={clinic?.name.lang}>{clinic?.name.text || "Dental Clinic"}</span>. {copy.allRights}
      </div>
    </footer>
  );
}
