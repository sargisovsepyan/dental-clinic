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
  it("reveals and remasks the password without clearing or submitting it", () => {
    render(<StaffLoginForm />);
    const password = screen.getByLabelText("Password");
    fireEvent.change(password, { target: { value: "Strong123!" } });
    expect(password).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");
    expect(password).toHaveValue("Strong123!");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveValue("Strong123!");
    expect(login).not.toHaveBeenCalled();
  });

  it("provides explicit password-toggle labels in every supported locale", () => {
    expect(staffMessages.en).toMatchObject({ showPassword: "Show password", hidePassword: "Hide password" });
    expect(staffMessages.ru).toMatchObject({ showPassword: "Показать пароль", hidePassword: "Скрыть пароль" });
    expect(staffMessages.hy.showPassword).not.toBe(staffMessages.en.showPassword);
    expect(staffMessages.hy.hidePassword).not.toBe(staffMessages.en.hidePassword);
  });

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
