import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StaffAuthProvider } from "@/components/staff/staff-auth-provider";
import { isLocale } from "@/i18n/locales";

export const metadata: Metadata = {
  title: "Staff workspace",
  description: "Authorized clinic staff workspace.",
  robots: { index: false, follow: false, nocache: true },
};

export default async function StaffLocaleLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <StaffAuthProvider locale={locale}>{children}</StaffAuthProvider>;
}
