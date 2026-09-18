import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StaffBeforeAfterManagement } from "@/components/staff/staff-before-after-management";
import { staffMessages } from "@/i18n/staff-messages";

const activeService = {
  _id: "64b000000000000000000011", name: "Active service", slug: "active-service",
  translations: { hy: { name: "Գործող ծառայություն" }, en: { name: "Active service" } },
  isActive: true,
};
const historicalService = {
  ...activeService,
  _id: "64b000000000000000000012", name: "Historical service", slug: "historical-service",
  translations: { en: { name: 'Historical service' } },
  isActive: false,
};
const unrelatedService = {
  ...historicalService,
  _id: "64b000000000000000000013", name: "Unrelated service", slug: "unrelated-service",
};
const activeDentist = {
  _id: "64b000000000000000000021", firstName: "Active", lastName: "Dentist", slug: "active-dentist",
  translations: { en: { firstName: 'Active', lastName: 'Dentist' } },
  isActive: true,
};
const historicalDentist = {
  ...activeDentist,
  _id: "64b000000000000000000022", firstName: "Historical", lastName: "Dentist",
  translations: { en: { firstName: 'Historical', lastName: 'Dentist' } },
  slug: "historical-dentist", isActive: false,
};
const unrelatedDentist = {
  ...historicalDentist,
  _id: "64b000000000000000000023", firstName: "Unrelated", slug: "unrelated-dentist",
};
const image = (name: string) => ({
  publicId: `dental-clinic/${name}`,
  secureUrl: `https://res.cloudinary.com/clinic-cloud/image/upload/dental-clinic/${name}.webp`,
  width: 640, height: 480, format: "webp", bytes: 1_024,
});
const governedCase = {
  id: "64b000000000000000000051",
  title: "Historical result",
  description: "",
  translations: { hy: { title: "Պատմական արդյունք" }, en: { title: "Historical result" } },
  service: { id: historicalService._id, label: historicalService.name },
  dentist: { id: historicalDentist._id, label: "Historical Dentist" },
  beforeImage: image("before"),
  afterImage: image("after"),
  publicationStatus: "published" as const,
  consentStatus: "active" as const,
  consentPolicyVersion: "2026-01",
  consentMethod: "written" as const,
  consentConfirmedAt: "2026-09-10T10:00:00.000Z",
  externalConsentReference: "",
  withdrawnAt: null,
  withdrawalReason: "",
  purgedAt: null,
  featured: false,
  active: true,
  sortOrder: 0,
  createdAt: "2026-09-10T10:00:00.000Z",
  updatedAt: "2026-09-10T10:00:00.000Z",
};

const api = {
  listBeforeAfterCases: vi.fn(), listServices: vi.fn(), listDentists: vi.fn(),
  updateBeforeAfterCase: vi.fn(), createBeforeAfterCase: vi.fn(),
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
  vi.stubEnv("NEXT_PUBLIC_API_URL", "http://127.0.0.1:5000/api/v1");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://127.0.0.1:3000");
  vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "clinic-cloud");
  api.listBeforeAfterCases.mockResolvedValue({
    cases: [governedCase], pagination: { page: 1, limit: 24, total: 1, pages: 1 },
  });
  api.listServices.mockResolvedValue([activeService, historicalService, unrelatedService]);
  api.listDentists.mockResolvedValue([activeDentist, historicalDentist, unrelatedDentist]);
  api.updateBeforeAfterCase.mockResolvedValue(undefined);
});

afterEach(() => vi.unstubAllEnvs());

async function openEditor() {
  render(<StaffBeforeAfterManagement />);
  expect(await screen.findByText("Historical result")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
}

describe("staff before/after historical relations", () => {
  it("shows retained archived relations, excludes unrelated inactive choices, and omits unchanged IDs", async () => {
    await openEditor();

    expect(screen.getByRole("option", { name: "Historical service — Archived" })).toBeVisible();
    expect(screen.getByRole("option", { name: "Historical Dentist — Archived" })).toBeVisible();
    expect(screen.queryByRole("option", { name: "Unrelated service" })).toBeNull();
    expect(screen.queryByRole("option", { name: "Unrelated Dentist" })).toBeNull();

    fireEvent.change(screen.getByLabelText("Case title *"), { target: { value: "Թարմացված արդյունք" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(api.updateBeforeAfterCase).toHaveBeenCalledTimes(1));
    const payload = api.updateBeforeAfterCase.mock.calls[0][1];
    expect(payload).not.toHaveProperty("serviceId");
    expect(payload).not.toHaveProperty("dentistId");
  });

  it("sends an explicit clear only for the historical relation the operator clears", async () => {
    await openEditor();
    fireEvent.change(screen.getByLabelText("Service"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(api.updateBeforeAfterCase).toHaveBeenCalledTimes(1));
    const payload = api.updateBeforeAfterCase.mock.calls[0][1];
    expect(payload.serviceId).toBe("");
    expect(payload).not.toHaveProperty("dentistId");
  });

  it("sends active replacements for historical relations", async () => {
    await openEditor();
    fireEvent.change(screen.getByLabelText("Service"), { target: { value: activeService._id } });
    fireEvent.change(screen.getByLabelText("Dentist"), { target: { value: activeDentist._id } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(api.updateBeforeAfterCase).toHaveBeenCalledTimes(1));
    expect(api.updateBeforeAfterCase.mock.calls[0][1]).toMatchObject({
      serviceId: activeService._id,
      dentistId: activeDentist._id,
    });
  });
});
