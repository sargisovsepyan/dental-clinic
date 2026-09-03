import axe from "axe-core";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BookingApiError } from "@/api/booking-client";
import { BookingChallenge } from "@/components/booking-challenge";
import { BookingFlow } from "@/components/booking-flow";

const api = vi.hoisted(() => ({
  getAvailability: vi.fn(),
  createPublicAppointment: vi.fn(),
  createIdempotencyKey: vi.fn(() => "0f459e5d-dbf8-4d92-b512-c329d39a610e"),
}));

vi.mock("@/api/booking-client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/api/booking-client")>();
  return { ...original, ...api };
});

const services = [{
  id: "64b000000000000000000011",
  slug: "test-cleaning",
  name: { text: "Cleaning", lang: "en" as const },
  shortDescription: { text: "Gentle cleaning", lang: "en" as const },
  durationMinutes: 60,
}];
const dentists = [{
  id: "64b000000000000000000021",
  slug: "ani-test",
  fullName: "Ani Test",
  fullNameLang: "en" as const,
  title: { text: "Dentist", lang: "en" as const },
  serviceIds: [services[0].id],
}];
const clinic = { timezone: "Asia/Yerevan", requireEmail: false, allowSameDayBooking: true, maxBookingDaysAhead: 60 };
const challenge = { provider: "disabled" as const };
const availability = (date = "2026-09-10", starts = ["09:00", "10:30"]) => ({
  date,
  timezone: "Asia/Yerevan",
  available: starts.length > 0,
  reason: starts.length ? null : "FULLY_BOOKED" as const,
  slots: starts.map((start, index) => ({
    start,
    end: start === "09:00" ? "10:00" : "11:30",
    startAt: `${date}T${String(5 + index).padStart(2, "0")}:00:00.000Z`,
    endAt: `${date}T${String(6 + index).padStart(2, "0")}:00:00.000Z`,
  })),
});
const result = {
  confirmationCode: "DC-0123456789ABCDEF",
  patientName: "Test Patient",
  date: "2026-09-10",
  startTime: "09:00",
  endTime: "10:00",
  status: "pending" as const,
  dentist: { firstName: "Authoritative", lastName: "Dentist" },
  service: { name: "Authoritative service", durationMinutes: 60 },
  price: { priceType: "from" as const, priceFrom: 20_000, priceTo: null, currency: "AMD" as const },
};

async function reachForm(user: ReturnType<typeof userEvent.setup>, date = "2026-09-10", time = "09:00") {
  await user.click(screen.getByRole("button", { name: /Cleaning/ }));
  await user.click(screen.getByRole("button", { name: /Ani Test/ }));
  fireEvent.change(screen.getByLabelText("Visit date"), { target: { value: date } });
  await user.click(await screen.findByRole("button", { name: `Choose ${time}` }));
}

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Full name/), "Test Patient");
  await user.type(screen.getByLabelText(/Phone number/), "+37499123456");
  await user.type(screen.getByLabelText(/Email address/), "patient@example.test");
  await user.type(screen.getByLabelText(/Comment/), "Please call first");
  await user.click(screen.getByRole("checkbox"));
}

beforeEach(() => {
  api.getAvailability.mockReset().mockResolvedValue(availability());
  api.createPublicAppointment.mockReset().mockResolvedValue(result);
  api.createIdempotencyKey.mockClear();
});

afterEach(() => {
  Object.defineProperty(document, "modelContext", { configurable: true, value: undefined });
  vi.unstubAllGlobals();
});

describe("booking flow", () => {
  it("progresses through all stages and renders the authoritative pending result", async () => {
    const user = userEvent.setup();
    const { container } = render(<BookingFlow locale="en" services={services} dentists={dentists} clinic={clinic} challenge={challenge} />);
    await reachForm(user);
    await fillForm(user);
    await user.dblClick(screen.getByRole("button", { name: "Send booking request" }));

    expect(await screen.findByRole("heading", { name: "Request received" })).toBeVisible();
    expect(screen.getByTestId("confirmation-code")).toHaveTextContent(result.confirmationCode);
    expect(screen.getByText("Authoritative service")).toBeVisible();
    expect(screen.getByText("Authoritative Dentist")).toBeVisible();
    expect(screen.queryByText("64b000000000000000000071")).not.toBeInTheDocument();
    expect(api.createPublicAppointment).toHaveBeenCalledTimes(1);
    expect(api.createPublicAppointment.mock.calls[0][0]).toMatchObject({
      patientName: "Test Patient",
      patientPhone: "+37499123456",
      privacyAccepted: true,
      locale: "en",
    });
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations.filter((item) => item.impact === "serious" || item.impact === "critical")).toEqual([]);
  });

  it("reuses one idempotency key after a network-uncertain failure", async () => {
    const user = userEvent.setup();
    api.createPublicAppointment
      .mockRejectedValueOnce(new BookingApiError({ kind: "network" }))
      .mockResolvedValueOnce({ ...result, status: "confirmed" });
    render(<BookingFlow locale="en" services={services} dentists={dentists} clinic={clinic} challenge={challenge} />);
    await reachForm(user);
    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "Send booking request" }));
    expect(await screen.findByText(/could not confirm whether/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Send booking request" }));
    expect(await screen.findByRole("heading", { name: "Visit confirmed" })).toBeVisible();
    expect(api.createIdempotencyKey).toHaveBeenCalledTimes(1);
    expect(api.createPublicAppointment.mock.calls[0][1]).toBe(api.createPublicAppointment.mock.calls[1][1]);
  });

  it("preserves patient fields while refreshing and clearing a conflicted slot", async () => {
    const user = userEvent.setup();
    api.getAvailability
      .mockResolvedValueOnce(availability())
      .mockResolvedValueOnce(availability("2026-09-10", ["10:30"]));
    api.createPublicAppointment.mockRejectedValueOnce(new BookingApiError({ kind: "http", status: 409 }));
    render(<BookingFlow locale="en" services={services} dentists={dentists} clinic={clinic} challenge={challenge} />);
    await reachForm(user);
    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "Send booking request" }));
    expect(await screen.findByText(/just taken/)).toBeVisible();
    expect(screen.queryByLabelText(/Full name/)).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Choose 10:30" }));
    expect(screen.getByLabelText(/Full name/)).toHaveValue("Test Patient");
    expect(screen.getByLabelText(/Phone number/)).toHaveValue("+37499123456");
    expect(screen.getByLabelText(/Email address/)).toHaveValue("patient@example.test");
    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("ignores a stale availability response after the selected date changes", async () => {
    const user = userEvent.setup();
    let resolveFirst!: (value: ReturnType<typeof availability>) => void;
    let resolveSecond!: (value: ReturnType<typeof availability>) => void;
    api.getAvailability
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));
    render(<BookingFlow locale="en" services={services} dentists={dentists} clinic={clinic} challenge={challenge} />);
    await user.click(screen.getByRole("button", { name: /Cleaning/ }));
    await user.click(screen.getByRole("button", { name: /Ani Test/ }));
    const date = screen.getByLabelText("Visit date");
    fireEvent.change(date, { target: { value: "2026-09-10" } });
    fireEvent.change(date, { target: { value: "2026-09-11" } });
    await act(async () => resolveSecond(availability("2026-09-11", ["12:00"])));
    expect(await screen.findByRole("button", { name: "Choose 12:00" })).toBeVisible();
    await act(async () => resolveFirst(availability("2026-09-10", ["09:00"])));
    expect(screen.queryByRole("button", { name: "Choose 09:00" })).not.toBeInTheDocument();
  });

  it("does not restore obsolete slots after an earlier selection is invalidated", async () => {
    const user = userEvent.setup();
    let resolveRequest!: (value: ReturnType<typeof availability>) => void;
    api.getAvailability.mockImplementationOnce(() => new Promise((resolve) => { resolveRequest = resolve; }));
    render(<BookingFlow locale="en" services={services} dentists={dentists} clinic={clinic} challenge={challenge} />);
    await user.click(screen.getByRole("button", { name: /Cleaning/ }));
    await user.click(screen.getByRole("button", { name: /Ani Test/ }));
    fireEvent.change(screen.getByLabelText("Visit date"), { target: { value: "2026-09-10" } });
    await user.click(screen.getByRole("button", { name: /Cleaning/ }));
    await act(async () => resolveRequest(availability()));
    expect(screen.queryByRole("button", { name: "Choose 09:00" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Visit date")).toHaveValue("");
  });

  it("distinguishes availability rate limiting and displays Retry-After", async () => {
    const user = userEvent.setup();
    api.getAvailability.mockRejectedValueOnce(new BookingApiError({ kind: "http", status: 429, retryAfterSeconds: 45 }));
    render(<BookingFlow locale="en" services={services} dentists={dentists} clinic={clinic} challenge={challenge} />);
    await user.click(screen.getByRole("button", { name: /Cleaning/ }));
    await user.click(screen.getByRole("button", { name: /Ani Test/ }));
    fireEvent.change(screen.getByLabelText("Visit date"), { target: { value: "2026-09-10" } });
    expect(await screen.findByText(/too many attempts/i)).toBeVisible();
    expect(screen.getByText("Try again in 45 seconds.")).toBeVisible();
  });

  it("clears stale booking selections on a 404 while preserving entered patient data", async () => {
    const user = userEvent.setup();
    api.createPublicAppointment.mockRejectedValueOnce(new BookingApiError({ kind: "http", status: 404 }));
    render(<BookingFlow locale="en" services={services} dentists={dentists} clinic={clinic} challenge={challenge} />);
    await reachForm(user);
    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "Send booking request" }));
    expect(await screen.findByText(/no longer available/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /Cleaning/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByLabelText(/Full name/)).not.toBeInTheDocument();
    await reachForm(user);
    expect(screen.getByLabelText(/Full name/)).toHaveValue("Test Patient");
    expect(screen.getByLabelText(/Phone number/)).toHaveValue("+37499123456");
  });

  it("registers a non-PII staging tool and rejects incompatible input without changing state", async () => {
    const registerTool = vi.fn();
    Object.defineProperty(document, "modelContext", { configurable: true, value: { registerTool } });
    render(<BookingFlow locale="en" services={services} dentists={dentists} clinic={clinic} challenge={challenge} />);
    await waitFor(() => expect(registerTool).toHaveBeenCalled());
    const tool = registerTool.mock.calls.at(-1)?.[0];
    expect(tool).toMatchObject({ name: "stage_booking_selection", annotations: { readOnlyHint: false } });
    await act(async () => tool.execute({ serviceSlug: "test-cleaning", dentistSlug: "ani-test", date: "2026-09-10" }));
    expect(screen.getByRole("button", { name: /Cleaning/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Visit date")).toHaveValue("2026-09-10");
    expect(() => tool.execute({ serviceSlug: "missing", dentistSlug: "ani-test" })).toThrow(/compatible/);
    expect(screen.getByRole("button", { name: /Cleaning/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps Turnstile isolated behind the configured provider and resets its widget", async () => {
    const renderWidget = vi.fn((_element: HTMLElement, options: Record<string, (token: string) => void>) => {
      options.callback("valid-challenge-token");
      return "widget-one";
    });
    const remove = vi.fn();
    Object.defineProperty(window, "turnstile", { configurable: true, value: { render: renderWidget, remove } });
    const onToken = vi.fn();
    const { rerender } = render(<BookingChallenge provider="turnstile" siteKey="public-site-key" locale="en" label="Security" loadingLabel="Loading" errorLabel="Error" resetVersion={0} onToken={onToken} onError={vi.fn()} />);
    await waitFor(() => expect(renderWidget).toHaveBeenCalledTimes(1));
    expect(onToken).toHaveBeenCalledWith("valid-challenge-token");
    rerender(<BookingChallenge provider="turnstile" siteKey="public-site-key" locale="en" label="Security" loadingLabel="Loading" errorLabel="Error" resetVersion={1} onToken={onToken} onError={vi.fn()} />);
    await waitFor(() => expect(remove).toHaveBeenCalledWith("widget-one"));
  });
});
