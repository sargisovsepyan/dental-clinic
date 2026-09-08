import { getStaffCatalog } from "@/api/staff-catalog";
import { StaffCatalogError } from "@/components/staff/staff-catalog-error";
import { StaffAppointments } from "@/components/staff/staff-appointments";
import { isLocale } from "@/i18n/locales";

export default async function StaffAppointmentsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  const catalog = await getStaffCatalog(locale);
  return catalog ? <StaffAppointments catalog={catalog} /> : <StaffCatalogError />;
}
