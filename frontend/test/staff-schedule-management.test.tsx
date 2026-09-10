import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StaffApiError } from "@/api/staff-client";
import { StaffScheduleManagement } from "@/components/staff/staff-schedule-management";
import { staffMessages } from "@/i18n/staff-messages";

const timestamp = "2026-01-01T00:00:00.000Z";
const clinic = {
  _id: "64b000000000000000000031", key: "default", clinicName: "Կլինիկա", tagline: "", description: "",
  phone: "", secondaryPhone: "", email: "", address: "", translations: { hy: { clinicName: "Կլինիկա" } },
  mapUrl: "", latitude: null, longitude: null, timezone: "Asia/Yerevan",
  socialLinks: { instagram: "", facebook: "", whatsapp: "", telegram: "" },
  weeklySchedule: Array.from({ length: 7 }, (_, index) => ({ dayOfWeek: index + 1, isOpen: index < 5, shifts: index < 5 ? [{ start: "09:00", end: "18:00" }] : [] })),
  bookingSettings: { isBookingEnabled: true, slotIntervalMinutes: 30, minBookingNoticeMinutes: 120, maxBookingDaysAhead: 60, bufferMinutes: 0, allowSameDayBooking: true, requireEmail: false, autoConfirmAppointments: false, maxAppointmentsPerPhonePerDay: 3 },
  scheduleRevision: 0, createdAt: timestamp, updatedAt: timestamp,
};
const dentist = {
  _id: "64b000000000000000000021", firstName: "Ani", lastName: "Preview", slug: "ani-preview",
  title: "", specializations: [], bio: "", translations: { hy: { title: "Ատամնաբույժ" } },
  experienceYears: 5, photoUrl: "", photo: null, languages: ["hy"], services: [],
  weeklySchedule: [], scheduleRevision: 0, isFeatured: false, bookingEnabled: false, isActive: true, sortOrder: 1,
  createdAt: timestamp, updatedAt: timestamp,
};
const conflict = {
  appointmentId: "64b000000000000000000071", date: "2026-09-20", startTime: "10:00", endTime: "11:00",
  dentistId: dentist._id, status: "confirmed" as const,
};
const exception = {
  _id: "64b000000000000000000041", dentist: dentist._id, date: "2026-09-22",
  isWorking: false, shifts: [], note: "Leave", createdAt: timestamp, updatedAt: timestamp,
};

const api = {
  getClinic: vi.fn(), listDentists: vi.fn(), listClinicClosures: vi.fn(), listScheduleExceptions: vi.fn(),
  updateClinic: vi.fn(), updateDentist: vi.fn(), setScheduleException: vi.fn(), deleteScheduleException: vi.fn(),
  setClinicClosure: vi.fn(), deleteClinicClosure: vi.fn(),
};
const authState = {
  locale: "en" as const,
  copy: staffMessages.en,
  user: { id: "64b000000000000000000091", name: "Admin", email: "admin@example.test", role: "admin" as string },
  api,
  handleApiError: vi.fn(),
};
vi.mock("@/components/staff/staff-auth-provider", () => ({ useStaffAuth: () => authState }));

beforeEach(() => {
  vi.clearAllMocks();
  authState.user.role = "admin";
  api.getClinic.mockResolvedValue(clinic);
  api.listDentists.mockResolvedValue([dentist]);
  api.listClinicClosures.mockResolvedValue([]);
  api.listScheduleExceptions.mockResolvedValue([]);
  api.updateClinic.mockResolvedValue({ ...clinic, scheduleRevision: 1, updatedAt: "2026-01-02T00:00:00.000Z" });
  api.setClinicClosure.mockResolvedValue(undefined);
});

describe("staff schedule management", () => {
  it("blocks non-admin direct access without loading protected schedule data", async () => {
    authState.user.role = "receptionist";
    render(<StaffScheduleManagement />);
    expect(screen.getByText("Access denied")).toBeVisible();
    await Promise.resolve();
    expect(api.getClinic).not.toHaveBeenCalled();
    expect(api.listDentists).not.toHaveBeenCalled();
  });

  it("loads bounded clinic-timezone override data", async () => {
    render(<StaffScheduleManagement />);
    expect(await screen.findByText("Clinic timezone: Asia/Yerevan")).toBeVisible();
    await waitFor(() => expect(api.listClinicClosures).toHaveBeenCalled());
    const [from, to] = api.listClinicClosures.mock.calls[0];
    expect(from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(from < to).toBe(true);
  });

  it("replays only the frozen weekly proposal after explicit impact acknowledgement", async () => {
    const acknowledgementToken = "a".repeat(64);
    api.updateClinic
      .mockRejectedValueOnce(new StaffApiError({
        kind: "http", status: 409, code: "SCHEDULE_CONFLICT_ACKNOWLEDGEMENT_REQUIRED",
        scheduleConflict: { currentScheduleRevision: 0, conflictCount: 1, conflicts: [conflict], conflictsTruncated: false, acknowledgementToken },
      }))
      .mockResolvedValueOnce({ ...clinic, scheduleRevision: 1 });
    api.getClinic.mockResolvedValueOnce(clinic).mockResolvedValue({ ...clinic, scheduleRevision: 1, updatedAt: "2026-01-02T00:00:00.000Z" });
    render(<StaffScheduleManagement />);
    await screen.findByText("Clinic timezone: Asia/Yerevan");
    fireEvent.click(screen.getByRole("button", { name: "Save weekly schedule" }));
    expect(await screen.findByRole("heading", { name: "Appointments are affected" })).toBeVisible();
    expect(screen.getByText("2026-09-20")).toBeVisible();
    expect(screen.queryByText(/patient/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "I reviewed the impact. Save these exact hours" }));

    await waitFor(() => expect(api.updateClinic).toHaveBeenCalledTimes(2));
    const first = api.updateClinic.mock.calls[0][0];
    const second = api.updateClinic.mock.calls[1][0];
    expect(first).toMatchObject({ expectedScheduleRevision: 0 });
    expect(first).not.toHaveProperty("scheduleConflictAcknowledgement");
    expect(second).toEqual({ ...first, scheduleConflictAcknowledgement: acknowledgementToken });
    expect(await screen.findByText("The schedule was saved and authoritative revisions were refreshed.")).toBeVisible();
  });

  it("does not auto-retry stale writes and refreshes the authoritative revision", async () => {
    api.updateClinic.mockRejectedValueOnce(new StaffApiError({
      kind: "http", status: 409, code: "SCHEDULE_REVISION_CONFLICT",
      scheduleConflict: { currentScheduleRevision: 1 },
    }));
    api.getClinic.mockResolvedValueOnce(clinic).mockResolvedValue({ ...clinic, scheduleRevision: 1, updatedAt: "2026-01-02T00:00:00.000Z" });
    render(<StaffScheduleManagement />);
    await screen.findByText("Clinic timezone: Asia/Yerevan");
    fireEvent.click(screen.getByRole("button", { name: "Save weekly schedule" }));

    expect(await screen.findByText(/Another operator changed this schedule/)).toBeVisible();
    expect(api.updateClinic).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Schedule revision: 1")).toBeVisible();
  });

  it("guards a clinic closure with the same frozen impact acknowledgement workflow", async () => {
    const acknowledgementToken = "b".repeat(64);
    api.setClinicClosure
      .mockRejectedValueOnce(new StaffApiError({
        kind: "http", status: 409, code: "SCHEDULE_CONFLICT_ACKNOWLEDGEMENT_REQUIRED",
        scheduleConflict: { currentScheduleRevision: 0, conflictCount: 1, conflicts: [conflict], conflictsTruncated: false, acknowledgementToken },
      }))
      .mockResolvedValueOnce(undefined);
    render(<StaffScheduleManagement />);
    await screen.findByText("Clinic timezone: Asia/Yerevan");
    fireEvent.click(screen.getByRole("tab", { name: "Clinic date overrides" }));
    fireEvent.click(screen.getByRole("button", { name: "Add date override" }));
    fireEvent.change(screen.getByLabelText("Clinic date"), { target: { value: "2026-09-20" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.setClinicClosure).toHaveBeenCalledWith("2026-09-20", {
      expectedScheduleRevision: 0, isOpen: false, shifts: [], note: "",
    }));
    fireEvent.click(await screen.findByRole("button", { name: "I reviewed the impact. Save these exact hours" }));
    await waitFor(() => expect(api.setClinicClosure).toHaveBeenCalledTimes(2));
    expect(api.setClinicClosure.mock.calls[1]).toEqual(["2026-09-20", {
      expectedScheduleRevision: 0, isOpen: false, shifts: [], note: "",
      scheduleConflictAcknowledgement: acknowledgementToken,
    }]);
  });

  it("creates and removes dentist date exceptions with the current dentist revision", async () => {
    api.listScheduleExceptions.mockResolvedValue([exception]);
    api.setScheduleException.mockResolvedValue(undefined);
    api.deleteScheduleException.mockResolvedValue(undefined);
    render(<StaffScheduleManagement />);
    await screen.findByText("Clinic timezone: Asia/Yerevan");
    fireEvent.click(screen.getByRole("tab", { name: "Dentist exceptions" }));
    fireEvent.change(screen.getByLabelText("Select a dentist"), { target: { value: dentist._id } });
    expect(await screen.findByText("2026-09-22")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Add date override" }));
    fireEvent.change(screen.getByLabelText("Clinic date"), { target: { value: "2026-09-23" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.setScheduleException).toHaveBeenCalledWith(dentist._id, "2026-09-23", {
      expectedScheduleRevision: 0, isWorking: false, shifts: [], note: "",
    }));

    fireEvent.click(screen.getByRole("button", { name: "Remove override" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm removal" }));
    await waitFor(() => expect(api.deleteScheduleException).toHaveBeenCalledWith(
      dentist._id, "2026-09-22", 0, undefined,
    ));
  });
});
