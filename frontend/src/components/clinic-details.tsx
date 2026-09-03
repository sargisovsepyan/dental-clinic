import { ExternalLink, Mail, MapPin, Phone } from "lucide-react";
import type { Locale } from "@/i18n/locales";
import { messages } from "@/i18n/messages";
import { safeEmailHref, safeExternalUrl, safePhoneHref, safeSocialUrl, type SocialPlatform } from "@/lib/safe-urls";

const socialPlatforms: SocialPlatform[] = ["instagram", "facebook", "whatsapp", "telegram"];

export function ClinicDetails({
  clinic,
  locale,
}: {
  clinic: {
    address: { text: string; lang?: Locale };
    phone: string;
    secondaryPhone: string;
    email: string;
    mapUrl: string;
    socialLinks: Record<string, string | undefined>;
    weeklySchedule: Array<{ dayOfWeek: number; isOpen: boolean; shifts: Array<{ start: string; end: string }> }>;
  };
  locale: Locale;
}) {
  const copy = messages[locale];
  const weekdayKeys = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
  const phone = safePhoneHref(clinic.phone);
  const secondaryPhone = safePhoneHref(clinic.secondaryPhone);
  const email = safeEmailHref(clinic.email);
  const map = safeExternalUrl(clinic.mapUrl);

  return (
    <div className="grid gap-12 lg:grid-cols-2 lg:gap-20">
      <div>
        <h2 className="display-type text-3xl">{copy.contactClinic}</h2>
        <div className="mt-7 grid gap-2">
          {clinic.address.text && (
            <p lang={clinic.address.lang} className="flex gap-3 py-3 leading-7">
              <MapPin aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" />{clinic.address.text}
            </p>
          )}
          {phone && <a href={phone} className="flex min-h-12 items-center gap-3 border-t py-3 font-semibold"><Phone aria-hidden="true" className="size-5 text-primary" />{clinic.phone}</a>}
          {secondaryPhone && <a href={secondaryPhone} className="flex min-h-12 items-center gap-3 border-t py-3 font-semibold"><Phone aria-hidden="true" className="size-5 text-primary" />{clinic.secondaryPhone}</a>}
          {email && <a href={email} className="flex min-h-12 items-center gap-3 break-all border-t py-3 font-semibold"><Mail aria-hidden="true" className="size-5 text-primary" />{clinic.email}</a>}
          {map && <a href={map} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center gap-3 border-t py-3 font-semibold text-primary"><ExternalLink aria-hidden="true" className="size-5" />{copy.map}</a>}
        </div>
        <div className="mt-7 flex flex-wrap gap-2">
          {socialPlatforms.map((platform) => {
            const href = safeSocialUrl(platform, clinic.socialLinks[platform]);
            return href ? <a key={platform} href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-semibold capitalize hover:bg-muted">{platform}</a> : null;
          })}
        </div>
      </div>
      <div>
        <h2 className="display-type text-3xl">{copy.regularHours}</h2>
        <dl className="mt-7">
          {clinic.weeklySchedule.map((day) => (
            <div key={day.dayOfWeek} className="grid grid-cols-[1fr_auto] gap-5 border-t py-3.5 text-sm first:border-t-0">
              <dt>{copy[weekdayKeys[day.dayOfWeek - 1] ?? "monday"]}</dt>
              <dd className="text-right font-semibold">
                {day.isOpen && day.shifts.length
                  ? day.shifts.map((shift) => `${shift.start}–${shift.end}`).join(", ")
                  : copy.closed}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
