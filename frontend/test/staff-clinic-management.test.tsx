import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StaffClinicManagement } from "@/components/staff/staff-clinic-management";
import { staffMessages } from "@/i18n/staff-messages";

const timestamp = "2026-01-01T00:00:00.000Z";
const clinic = {
  _id: "64b000000000000000000031", key: "default", clinicName: "Կլինիկա", tagline: "", description: "",
  phone: "+374 10 000000", secondaryPhone: "", email: "clinic@example.test", address: "",
  translations: { hy: { clinicName: "Կլինիկա", address: "Երևան" }, en: { clinicName: "Clinic", address: "Yerevan" } },
  mapUrl: "https://maps.example.test/clinic", latitude: null, longitude: null, timezone: "Asia/Yerevan",
  socialLinks: { instagram: "https://www.instagram.com/test", facebook: "", whatsapp: "", telegram: "" },
  weeklySchedule: [],
  bookingSettings: { isBookingEnabled: true, slotIntervalMinutes: 30, minBookingNoticeMinutes: 120, maxBookingDaysAhead: 60, bufferMinutes: 0, allowSameDayBooking: true, requireEmail: false, autoConfirmAppointments: false, maxAppointmentsPerPhonePerDay: 3 },
  scheduleRevision: 4, createdAt: timestamp, updatedAt: timestamp,
};
const api = { getClinic: vi.fn(), updateClinic: vi.fn() };
const authState = {
  locale: "en" as const,
  copy: staffMessages.en,
  user: { id: "64b000000000000000000091", name: "Admin", email: "admin@example.test", role: "admin" as string },
  api,
  handleApiError: vi.fn(),
};
vi.mock("@/components/staff/staff-auth-provider", () => ({ useStaffAuth: () => authState }));

beforeEach(() => {
  vi.clearAllMocks(); authState.user.role = "admin";
  api.getClinic.mockResolvedValue(clinic);
  api.updateClinic.mockResolvedValue({ ...clinic, phone: "+374 10 111111", updatedAt: "2026-01-02T00:00:00.000Z" });
});

describe("staff clinic settings", () => {
  it("denies a non-admin without fetching the public-shaped management form", async () => {
    authState.user.role = "dentist";
    render(<StaffClinicManagement />);
    expect(screen.getByText("Access denied")).toBeVisible();
    await Promise.resolve();
    expect(api.getClinic).not.toHaveBeenCalled();
  });

  it("saves localized safe settings and never submits timezone or weekly schedule", async () => {
    render(<StaffClinicManagement />);
    expect(await screen.findByText("Clinic timezone: Asia/Yerevan")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Primary phone"), { target: { value: "+374 10 111111" } });
    fireEvent.change(screen.getByLabelText("Booking horizon (days)"), { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(api.updateClinic).toHaveBeenCalled());
    const payload = api.updateClinic.mock.calls[0][0];
    expect(payload).toMatchObject({
      phone: "+374 10 111111",
      translations: { hy: { clinicName: "Կլինիկա", address: "Երևան" }, en: { clinicName: "Clinic", address: "Yerevan" } },
      bookingSettings: { maxBookingDaysAhead: 90 },
    });
    expect(payload).not.toHaveProperty("timezone");
    expect(payload).not.toHaveProperty("weeklySchedule");
    expect(payload).not.toHaveProperty("scheduleRevision");
    expect(await screen.findByText("Clinic settings were saved from the authoritative response.")).toBeVisible();
  });

  it("rejects credential-bearing and off-platform links before mutation", async () => {
    render(<StaffClinicManagement />);
    await screen.findByText("Clinic timezone: Asia/Yerevan");
    fireEvent.change(screen.getByLabelText("HTTPS map URL"), { target: { value: "https://user:pass@maps.example.test/clinic" } });
    fireEvent.change(screen.getByLabelText("Instagram URL"), { target: { value: "https://evil.example/instagram" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText(/credential-free HTTPS URL/)).toBeVisible();
    expect(api.updateClinic).not.toHaveBeenCalled();
  });
});
