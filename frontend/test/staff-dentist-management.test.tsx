import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StaffDentistManagement } from "@/components/staff/staff-dentist-management";
import { staffMessages } from "@/i18n/staff-messages";

const service = {
  _id: "64b000000000000000000011", name: "Մաքրում", slug: "cleaning",
  category: { _id: "64b000000000000000000001", name: "Բուժում", slug: "treatment", translations: { hy: { name: "Բուժում" } } },
  shortDescription: "", description: "", translations: { hy: { name: "Մաքրում" }, en: { name: "Cleaning" } },
  priceType: "from", priceFrom: 20_000, priceTo: null, currency: "AMD", durationMinutes: 60,
  imageUrl: "", image: null, isFeatured: false, bookingEnabled: true, isActive: true, sortOrder: 1,
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
};
const dentist = {
  _id: "64b000000000000000000021", firstName: "Ani", lastName: "Preview", slug: "ani-preview",
  title: "", specializations: [], bio: "", translations: { hy: { title: "Ատամնաբույժ" }, en: { firstName: "Ani", lastName: "Preview", title: "Dentist" } },
  experienceYears: 5, photoUrl: "", photo: null, languages: ["hy", "en"],
  services: [{ _id: service._id, name: service.name, slug: service.slug, translations: service.translations, isActive: true, bookingEnabled: true }],
  weeklySchedule: [], scheduleRevision: 3, isFeatured: false, bookingEnabled: false, isActive: true, sortOrder: 1,
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
};
const inactiveAssignedService = {
  ...service,
  _id: "64b000000000000000000012",
  name: "Արխիվացված կապ",
  slug: "archived-assignment",
  translations: { hy: { name: "Արխիվացված կապ" }, en: { name: "Archived assignment" } },
  isActive: false,
  bookingEnabled: false,
};
const inactiveUnassignedService = {
  ...inactiveAssignedService,
  _id: "64b000000000000000000013",
  name: "Չկցված արխիվացված",
  slug: "unassigned-archived",
  translations: { hy: { name: "Չկցված արխիվացված" }, en: { name: "Unassigned archived" } },
};
const dentistWithInactiveAssignment = {
  ...dentist,
  services: [
    dentist.services[0],
    {
      _id: inactiveAssignedService._id,
      name: inactiveAssignedService.name,
      slug: inactiveAssignedService.slug,
      translations: inactiveAssignedService.translations,
      isActive: false,
      bookingEnabled: false,
    },
  ],
};

const api = {
  listDentists: vi.fn(), listServices: vi.fn(), createDentist: vi.fn(), updateDentist: vi.fn(),
  disableDentist: vi.fn(), restoreDentist: vi.fn(), listStaff: vi.fn(),
};
const authState = {
  locale: "en" as const,
  copy: staffMessages.en,
  user: { id: "64b000000000000000000091", name: "Admin", email: "admin@example.test", role: "admin" as string },
  api,
  handleApiError: vi.fn(),
};
const push = vi.fn();
vi.mock("@/components/staff/staff-auth-provider", () => ({ useStaffAuth: () => authState }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

beforeEach(() => {
  vi.clearAllMocks();
  authState.user.role = "admin";
  api.listDentists.mockResolvedValue([dentist]);
  api.listServices.mockResolvedValue([service]);
  api.listStaff.mockResolvedValue({ staff: [], pagination: { page: 1, limit: 100, total: 0, pages: 0 } });
  api.createDentist.mockResolvedValue(dentist);
  api.updateDentist.mockResolvedValue(undefined);
});

describe("staff dentist management", () => {
  it("starts a profile-bound invitation from an unlinked dentist card", async () => {
    render(<StaffDentistManagement />);
    expect(await screen.findByText("Not configured")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Invite to staff workspace" }));
    expect(push).toHaveBeenCalledWith(`/en/staff/team?inviteDentist=${dentist._id}`);
  });

  it("shows current access state and keeps archived profiles eligible for reassignment", async () => {
    const archived = {
      id: "64b000000000000000000098", name: "Archived Dentist", email: "archived@example.test",
      role: "dentist", dentistProfile: dentist._id, isActive: false, isSetupComplete: true,
      deactivatedAt: "2026-09-10T00:00:00.000Z", createdAt: dentist.createdAt, updatedAt: dentist.updatedAt,
    };
    api.listStaff.mockResolvedValue({ staff: [archived], pagination: { page: 1, limit: 100, total: 1, pages: 1 } });
    render(<StaffDentistManagement />);
    expect(await screen.findByText("Access disabled")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Invite to staff workspace" }));
    expect(push).toHaveBeenCalledWith(`/en/staff/team?inviteDentist=${dentist._id}`);
    fireEvent.click(screen.getByRole("button", { name: "Open employee" }));
    expect(push).toHaveBeenCalledWith(`/en/staff/team?staff=${archived.id}&view=archive`);
  });

  it("shows a pending linked employee instead of offering a duplicate invitation", async () => {
    const pendingAccount = {
      id: "64b000000000000000000097", name: "Pending Dentist", email: "pending@example.test",
      role: "dentist", dentistProfile: dentist._id, isActive: false, isSetupComplete: false,
      deactivatedAt: null, createdAt: dentist.createdAt, updatedAt: dentist.updatedAt,
    };
    api.listStaff.mockResolvedValue({ staff: [pendingAccount], pagination: { page: 1, limit: 100, total: 1, pages: 1 } });
    render(<StaffDentistManagement />);
    expect(await screen.findByText("Awaiting account setup")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Invite to staff workspace" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open employee" }));
    expect(push).toHaveBeenCalledWith(`/en/staff/team?staff=${pendingAccount.id}&view=pending`);
  });
  it("denies non-admin roles without fetching dentist administration", async () => {
    authState.user.role = "dentist";
    render(<StaffDentistManagement />);
    expect(screen.getByText("Access denied")).toBeVisible();
    await Promise.resolve();
    expect(api.listDentists).not.toHaveBeenCalled();
  });

  it("edits profile fields separately from schedules and unchanged service relations", async () => {
    render(<StaffDentistManagement />);
    expect(await screen.findByText("Ani Preview")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Years of experience"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(api.updateDentist).toHaveBeenCalled());
    const payload = api.updateDentist.mock.calls[0][1];
    expect(payload).not.toHaveProperty("services");
    expect(payload).not.toHaveProperty("weeklySchedule");
    expect(payload).not.toHaveProperty("expectedScheduleRevision");
    expect(payload).not.toHaveProperty("slug");
    expect(payload).toMatchObject({ experienceYears: 6, bookingEnabled: false });
  });

  it("creates a localized dentist with a closed default schedule and server-owned slug", async () => {
    render(<StaffDentistManagement />);
    await screen.findByText("Ani Preview");
    fireEvent.click(screen.getByRole("button", { name: "Add dentist" }));
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Aram" } });
    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Test" } });
    fireEvent.change(screen.getByLabelText("Professional title *"), { target: { value: "Ատամնաբույժ" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(api.createDentist).toHaveBeenCalled());
    const payload = api.createDentist.mock.calls[0][0];
    expect(payload).toMatchObject({
      firstName: "Aram", lastName: "Test", weeklySchedule: [], bookingEnabled: false, isActive: true,
      translations: { hy: { title: "Ատամնաբույժ" } },
    });
    expect(payload).not.toHaveProperty("slug");
    expect(payload).not.toHaveProperty("photoUrl");
  });

  it("preserves an existing inactive service assignment during unrelated profile edits", async () => {
    api.listDentists.mockResolvedValue([dentistWithInactiveAssignment]);
    api.listServices.mockResolvedValue([service, inactiveAssignedService, inactiveUnassignedService]);
    render(<StaffDentistManagement />);
    expect(await screen.findByText("Ani Preview")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    const retainedInactive = screen.getByRole("checkbox", { name: /Archived assignment/ });
    expect(retainedInactive).toBeChecked();
    expect(retainedInactive).toBeDisabled();
    expect(screen.queryByRole("checkbox", { name: /Unassigned archived/ })).toBeNull();

    fireEvent.change(screen.getByLabelText("Years of experience"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.updateDentist).toHaveBeenCalledTimes(1));
    expect(api.updateDentist.mock.calls[0][1]).not.toHaveProperty("services");
  });

  it("blocks service-assignment changes while inactive relationships must be retained", async () => {
    api.listDentists.mockResolvedValue([dentistWithInactiveAssignment]);
    api.listServices.mockResolvedValue([service, inactiveAssignedService]);
    render(<StaffDentistManagement />);
    expect(await screen.findByText("Ani Preview")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Cleaning" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText(/retains archived service assignments/i)).toBeVisible();
    expect(api.updateDentist).not.toHaveBeenCalled();
  });
});
