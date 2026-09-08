import "server-only";

import { getBookingClinic, getBookingDentists, getBookingServices } from "@/api/public-client";
import { clinicView, dentistView, serviceView } from "@/api/public-view-models";
import type { StaffCatalog } from "@/components/staff/staff-appointment-types";
import type { Locale } from "@/i18n/locales";

export async function getStaffCatalog(locale: Locale): Promise<StaffCatalog | null> {
  try {
    const [services, dentists, clinic] = await Promise.all([
      getBookingServices(), getBookingDentists(), getBookingClinic(),
    ]);
    const serviceViews = services.map((item) => serviceView(item, locale));
    const activeIds = new Set(serviceViews.map((item) => item.id));
    const dentistViews = dentists.map((item) => dentistView(item, locale));
    const clinicData = clinicView(clinic, locale);
    return {
      services: serviceViews.map((item) => ({ id: item.id, name: item.name.text, durationMinutes: item.durationMinutes })),
      dentists: dentistViews.map((item) => ({
        id: item.id,
        name: item.fullName,
        serviceIds: item.services.filter((service) => activeIds.has(service.id)).map((service) => service.id),
      })).filter((item) => item.serviceIds.length > 0),
      clinic: {
        timezone: clinicData.timezone,
        requireEmail: clinicData.bookingSettings.requireEmail,
        allowSameDayBooking: clinicData.bookingSettings.allowSameDayBooking,
        maxBookingDaysAhead: clinicData.bookingSettings.maxBookingDaysAhead,
      },
    };
  } catch {
    return null;
  }
}
