export type StaffCatalog = {
  services: Array<{ id: string; name: string; durationMinutes: number }>;
  dentists: Array<{ id: string; name: string; serviceIds: string[] }>;
  clinic: {
    timezone: string;
    requireEmail: boolean;
    allowSameDayBooking: boolean;
    maxBookingDaysAhead: number;
  };
};
