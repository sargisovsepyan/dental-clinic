import { notFound } from "next/navigation";
import { getClinic } from "@/api/public-client";
import { clinicView } from "@/api/public-view-models";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { isLocale } from "@/i18n/locales";

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale: localeParam } = await params;
  if (!isLocale(localeParam)) notFound();

  let clinic: ReturnType<typeof clinicView> | undefined;
  try {
    clinic = clinicView(await getClinic(), localeParam);
  } catch {
    clinic = undefined;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader locale={localeParam} clinicName={clinic?.name} bookingEnabled={clinic?.bookingSettings.isBookingEnabled} />
      <main id="main-content" className="flex-1" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter
        locale={localeParam}
        clinic={clinic ? {
          name: clinic.name,
          address: clinic.address,
          phone: clinic.phone,
          email: clinic.email,
          socialLinks: clinic.socialLinks,
        } : undefined}
      />
    </div>
  );
}
