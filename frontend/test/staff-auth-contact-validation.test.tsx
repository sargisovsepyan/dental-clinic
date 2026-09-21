import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { staffApi } from "@/api/staff-client";
import { StaffLoginForm } from "@/components/staff/staff-login-form";
import { ForgotPasswordForm } from "@/components/staff/staff-password-forms";
import { staffMessages } from "@/i18n/staff-messages";

const login = vi.fn();
const clearNotice = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/staff/login",
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("@/components/staff/staff-auth-provider", () => ({
  useStaffAuth: () => ({
    locale: "en",
    copy: staffMessages.en,
    status: "anonymous",
    user: null,
    notice: null,
    login,
    clearNotice,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(staffApi, "forgotPassword").mockResolvedValue(undefined);
});

describe("staff account email validation", () => {
  it("blocks a backend-incompatible login email before authentication", () => {
    render(<StaffLoginForm />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "staff@-example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Strong123!" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByText("Enter a valid email address.")).toBeVisible();
    expect(login).not.toHaveBeenCalled();
  });

  it("blocks the same malformed email without changing reset enumeration semantics", () => {
    render(<ForgotPasswordForm />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "staff@-example.com" } });
    fireEvent.submit(screen.getByRole("button", { name: "Send reset instructions" }).closest("form")!);
    expect(screen.getByText("Enter a valid email address.")).toBeVisible();
    expect(staffApi.forgotPassword).not.toHaveBeenCalled();
  });
});
