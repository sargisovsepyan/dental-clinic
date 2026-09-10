import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StaffApiError } from "@/api/staff-client";
import { StaffCatalogManagement } from "@/components/staff/staff-catalog-management";
import { staffMessages } from "@/i18n/staff-messages";

const category = {
  _id: "64b000000000000000000001", name: "Բուժում", slug: "treatment", description: "",
  translations: { hy: { name: "Բուժում", description: "Հայերեն" }, en: { name: "Treatment" } },
  imageUrl: "", sortOrder: 1, isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
};
const service = {
  _id: "64b000000000000000000011", name: "Մաքրում", slug: "cleaning", category,
  shortDescription: "", description: "", translations: { hy: { name: "Մաքրում" }, en: { name: "Cleaning" } },
  priceType: "from", priceFrom: 20_000, priceTo: null, currency: "AMD", durationMinutes: 60,
  imageUrl: "", image: null, isFeatured: false, bookingEnabled: true, isActive: true, sortOrder: 1,
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
};

const api = {
  listCategories: vi.fn(), listServices: vi.fn(), createCategory: vi.fn(), updateCategory: vi.fn(),
  disableCategory: vi.fn(), restoreCategory: vi.fn(), createService: vi.fn(), updateService: vi.fn(),
  disableService: vi.fn(), restoreService: vi.fn(),
};
const authState = {
  locale: "en" as const,
  copy: staffMessages.en,
  user: { id: "64b000000000000000000091", name: "Admin", email: "admin@example.test", role: "admin" as const },
  api,
  handleApiError: vi.fn(),
};

vi.mock("@/components/staff/staff-auth-provider", () => ({ useStaffAuth: () => authState }));

beforeEach(() => {
  vi.clearAllMocks();
  authState.user.role = "admin";
  api.listCategories.mockResolvedValue([category]);
  api.listServices.mockResolvedValue([service]);
  api.createCategory.mockResolvedValue(undefined);
  api.updateService.mockResolvedValue(undefined);
});

describe("staff category and service management", () => {
  it("denies a non-admin direct route without issuing management requests", async () => {
    authState.user.role = "receptionist" as "admin";
    render(<StaffCatalogManagement />);
    expect(screen.getByText("Access denied")).toBeVisible();
    await Promise.resolve();
    expect(api.listCategories).not.toHaveBeenCalled();
    expect(api.listServices).not.toHaveBeenCalled();
  });

  it("loads authoritative admin lists and creates a localized category without a client slug", async () => {
    render(<StaffCatalogManagement />);
    expect(await screen.findByText("Treatment")).toBeVisible();
    expect(api.listCategories).toHaveBeenCalledTimes(1);
    expect(api.listServices).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Add category" }));
    fireEvent.change(screen.getByLabelText("Category name *"), { target: { value: "Վիրաբուժություն" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(api.createCategory).toHaveBeenCalledWith({
      translations: { hy: { name: "Վիրաբուժություն" } },
      sortOrder: 0,
      isActive: true,
    }));
    expect(api.createCategory.mock.calls[0][0]).not.toHaveProperty("slug");
    await screen.findByText("The server confirmed the change.");
    expect(api.listCategories).toHaveBeenCalledTimes(2);
  });

  it("does not resend an unchanged category relation when editing a service", async () => {
    render(<StaffCatalogManagement />);
    await screen.findByText("Treatment");
    fireEvent.click(screen.getByRole("tab", { name: "Services" }));
    expect(await screen.findByText("Cleaning")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Duration (minutes)"), { target: { value: "75" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(api.updateService).toHaveBeenCalled());
    const payload = api.updateService.mock.calls[0][1];
    expect(payload).not.toHaveProperty("category");
    expect(payload).not.toHaveProperty("slug");
    expect(payload).toMatchObject({ durationMinutes: 75, priceType: "from", priceFrom: 20_000 });
  });

  it("surfaces category referential conflicts without optimistic removal", async () => {
    api.disableCategory.mockRejectedValue(new StaffApiError({ kind: "http", status: 409 }));
    render(<StaffCatalogManagement />);
    await screen.findByText("Treatment");
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm archive" }));
    expect(await screen.findByText("Archive the active services in this category first.")).toBeVisible();
    expect(screen.getByText("Treatment")).toBeVisible();
    expect(api.listCategories).toHaveBeenCalledTimes(1);
  });
});
