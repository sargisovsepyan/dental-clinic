import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StaffApiError, type StaffAppointment } from "@/api/staff-client";
import { StaffAppointmentDetail } from "@/components/staff/staff-appointment-detail";
import { StaffAppointments } from "@/components/staff/staff-appointments";
import { staffMessages } from "@/i18n/staff-messages";

vi.mock("next/link", () => ({ default: ({ href, ...props }: ComponentProps<"a">) => <a href={href} {...props} /> }));

const { api, authState, handleApiError } = vi.hoisted(() => ({
  api: {
    listAppointments: vi.fn(), getAppointment: vi.fn(), updateStatus: vi.fn(),
    cancelAppointment: vi.fn(), rescheduleAppointment: vi.fn(), getRescheduleAvailability: vi.fn(),
    getAvailability: vi.fn(), createAppointment: vi.fn(),
  },
  authState: { user: { id: "64b000000000000000000091", name: "Admin", email: "admin@preview.local", role: "admin" as "admin" | "receptionist" | "dentist" } },
  handleApiError: vi.fn(),
}));

vi.mock("@/components/staff/staff-auth-provider", () => ({
  useStaffAuth: () => ({
    locale: "en", copy: staffMessages.en, user: authState.user,
    api, handleApiError,
  }),
}));

const appointment: StaffAppointment = {
  _id: "64b000000000000000000071", confirmationCode: "DC-STAFF0000000001",
  patientName: "Preview Patient", patientPhone: "+374 00 111111", patientEmail: "patient@preview.local",
  dentist: "64b000000000000000000021", service: "64b000000000000000000011",
  dentistSnapshot: { firstName: "Ani", lastName: "Preview", title: "Dentist", translations: {} },
  serviceSnapshot: { name: "Cleaning", durationMinutes: 60, translations: {} },
  priceSnapshot: { priceType: "fixed", priceFrom: 20000, priceTo: null, currency: "AMD" },
  date: "2026-09-10", startTime: "09:00", endTime: "10:00",
  startAt: "2026-09-10T05:00:00.000Z", endAt: "2026-09-10T06:00:00.000Z",
  bufferMinutes: 0, mutationVersion: 0, scheduleRevision: 0, notificationLocale: "en",
  rescheduleHistory: [], status: "pending", source: "phone", patientComment: "Call first", internalNote: "Front desk",
  privacyConsentAt: "2026-09-01T10:00:00.000Z", privacyConsentMethod: "phone", privacyPolicyVersion: "v1",
  createdAt: "2026-09-01T10:00:00.000Z", updatedAt: "2026-09-01T10:00:00.000Z",
};

const catalog = {
  services: [{ id: "64b000000000000000000011", name: "Cleaning", durationMinutes: 60 }],
  dentists: [{ id: "64b000000000000000000021", name: "Ani Preview", serviceIds: ["64b000000000000000000011"] }],
  clinic: { timezone: "Asia/Yerevan", requireEmail: false, allowSameDayBooking: true, maxBookingDaysAhead: 60 },
};

beforeEach(() => {
  authState.user.role = "admin";
  vi.resetAllMocks();
  api.listAppointments.mockResolvedValue({ appointments: [appointment], pagination: { page: 1, limit: 25, total: 1, pages: 1 } });
  api.getAppointment.mockResolvedValue(appointment);
});

describe("staff appointment workspace", () => {
  it("renders a bounded appointment list and applies non-PII filters", async () => {
    render(<StaffAppointments catalog={catalog} />);
    expect(await screen.findAllByText("Preview Patient")).not.toHaveLength(0);
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "confirmed" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    await waitFor(() => expect(api.listAppointments).toHaveBeenLastCalledWith(expect.objectContaining({ status: "confirmed", limit: 25 }), expect.any(AbortSignal)));
    expect(api.listAppointments.mock.calls.at(-1)?.[0]).not.toHaveProperty("phone");
    expect(screen.getAllByRole("link", { name: "View" })[0]).toHaveAttribute("href", `/en/staff/appointments/${appointment._id}`);
  });

  it("does not fetch or render patient data for a dentist role", async () => {
    authState.user.role = "dentist";
    render(<StaffAppointments catalog={catalog} />);
    expect(screen.getByText("Access denied")).toBeVisible();
    expect(screen.queryByText("Preview Patient")).toBeNull();
    await Promise.resolve();
    expect(api.listAppointments).not.toHaveBeenCalled();
  });

  it("sends the reviewed mutation version and replaces state from a fresh read", async () => {
    api.getAppointment.mockResolvedValueOnce(appointment).mockResolvedValueOnce({ ...appointment, status: "confirmed", mutationVersion: 1 });
    api.updateStatus.mockResolvedValue({ ...appointment, status: "confirmed", mutationVersion: 1 });
    render(<StaffAppointmentDetail appointmentId={appointment._id} catalog={catalog} />);
    await screen.findByText("Preview Patient");
    fireEvent.click(screen.getByRole("button", { name: "Mark as Confirmed" }));
    await waitFor(() => expect(api.updateStatus).toHaveBeenCalledWith(appointment._id, 0, "confirmed"));
    expect(await screen.findByText("Confirmed")).toBeVisible();
    expect(api.getAppointment).toHaveBeenCalledTimes(2);
  });

  it("does not retry a stale write and refetches before another action", async () => {
    api.getAppointment.mockResolvedValueOnce(appointment).mockResolvedValueOnce({ ...appointment, mutationVersion: 2 });
    api.updateStatus.mockRejectedValue(new StaffApiError({ kind: "http", status: 409, code: "APPOINTMENT_VERSION_CONFLICT", currentMutationVersion: 2 }));
    render(<StaffAppointmentDetail appointmentId={appointment._id} catalog={catalog} />);
    await screen.findByText("Preview Patient");
    fireEvent.click(screen.getByRole("button", { name: "Mark as Confirmed" }));
    expect(await screen.findByText(/changed after you opened it/i)).toBeVisible();
    expect(api.updateStatus).toHaveBeenCalledTimes(1);
    expect(api.getAppointment).toHaveBeenCalledTimes(2);
  });

  it("cancels with the reviewed version and renders only the authoritative refetch", async () => {
    api.getAppointment.mockResolvedValueOnce(appointment).mockResolvedValueOnce({
      ...appointment, status: "cancelled", mutationVersion: 1,
    });
    api.cancelAppointment.mockResolvedValue({ ...appointment, status: "cancelled", mutationVersion: 1 });
    render(<StaffAppointmentDetail appointmentId={appointment._id} catalog={catalog} />);
    await screen.findByText("Preview Patient");

    fireEvent.click(screen.getByRole("button", { name: "Cancel appointment" }));
    fireEvent.change(await screen.findByLabelText("Cancellation reason"), { target: { value: "Requested by patient" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm cancellation" }));

    await waitFor(() => expect(api.cancelAppointment).toHaveBeenCalledWith(
      appointment._id, 0, "Requested by patient",
    ));
    expect(await screen.findByText("Cancelled")).toBeVisible();
    expect(api.getAppointment).toHaveBeenCalledTimes(2);
  });

  it("reschedules only a freshly reviewed protected slot with the current version", async () => {
    const rescheduled = {
      ...appointment, date: "2026-09-11", startTime: "10:30", endTime: "11:30", mutationVersion: 1,
    };
    api.getAppointment.mockResolvedValueOnce(appointment).mockResolvedValueOnce(rescheduled);
    api.getRescheduleAvailability.mockResolvedValue({
      date: "2026-09-11", timezone: "Asia/Yerevan", available: true, reason: null,
      dentist: { id: catalog.dentists[0].id }, service: { id: catalog.services[0].id }, rules: {},
      slots: [{ start: "10:30", end: "11:30", startAt: "2026-09-11T06:30:00.000Z", endAt: "2026-09-11T07:30:00.000Z" }],
    });
    api.rescheduleAppointment.mockResolvedValue(rescheduled);
    render(<StaffAppointmentDetail appointmentId={appointment._id} catalog={catalog} />);
    await screen.findByText("Preview Patient");

    fireEvent.change(screen.getByLabelText("Date", { selector: "input" }), { target: { value: "2026-09-11" } });
    fireEvent.click(screen.getByRole("button", { name: "Check availability" }));
    fireEvent.click(await screen.findByRole("button", { name: "10:30–11:30" }));
    fireEvent.change(screen.getByLabelText("Reason (optional)"), { target: { value: "Patient request" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm reschedule" }));

    await waitFor(() => expect(api.rescheduleAppointment).toHaveBeenCalledWith(appointment._id, {
      expectedMutationVersion: 0,
      serviceId: catalog.services[0].id,
      dentistId: catalog.dentists[0].id,
      date: "2026-09-11",
      startTime: "10:30",
      reason: "Patient request",
    }));
    expect(api.getAppointment).toHaveBeenCalledTimes(2);
  });
});
