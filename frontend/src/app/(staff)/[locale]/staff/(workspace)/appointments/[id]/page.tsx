import { getStaffCatalog } from "@/api/staff-catalog";
import { StaffAppointmentDetail } from "@/components/staff/staff-appointment-detail";
import { StaffCatalogError } from "@/components/staff/staff-catalog-error";
import { isLocale, isObjectId } from "@/i18n/locales";

export default async function StaffAppointmentPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale) || !isObjectId(id)) return null;
  const catalog = await getStaffCatalog(locale);
  return catalog ? <StaffAppointmentDetail appointmentId={id} catalog={catalog} /> : <StaffCatalogError />;
}
