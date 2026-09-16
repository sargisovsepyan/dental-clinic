import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StaffTeamManagement } from "@/components/staff/staff-team-management";
import { StaffAuditManagement, AuditMetadataView } from "@/components/staff/staff-audit-management";
import { StaffApiError } from "@/api/staff-client";
import type { GovernedStaff } from "@/api/staff-governance";
import { staffMessages } from "@/i18n/staff-messages";
const time = "2026-09-15T08:00:00.000Z";
const admin = { id: "64b000000000000000000091", name: "Admin", email: "admin@example.test", role: "admin" };
const member = (id: string, name: string, extra = {}): GovernedStaff => ({ id, name, email: `${name}@example.test`, role: "dentist", isActive: true, isSetupComplete: true, deactivatedAt: null, createdAt: time, updatedAt: time, ...extra });
const other = member("64b000000000000000000092", "Other");
const pending = member("64b000000000000000000096", "Pending", { isActive: false, isSetupComplete: false });
const inactive = member("64b000000000000000000095", "Inactive", { isActive: false });
const self = member(admin.id, admin.name, { role: "admin", email: admin.email });
const page = (staff = [self, other, inactive, pending]) => ({ staff, pagination: { page: 1, limit: 12, total: staff.length, pages: 1 } });
const log = (action: string) => ({ id: "64b000000000000000000001", requestId: "safe-reference", actor: null, action, entityType: "future-entity", entityId: "ref", method: "POST", path: "/safe", metadata: { reason: "<img src=x onerror=alert(1)>" }, createdAt: time });
const auditPage = (action: string) => ({ logs: [log(action)], pagination: { page: 1, limit: 10, total: 1, pages: 1 } });
const api = { listStaff: vi.fn(), getStaff: vi.fn(), mutateStaff: vi.fn(), inviteStaff: vi.fn(), listAuditLogs: vi.fn() };
const replace = vi.fn();
const state = { api, locale: "en", copy: staffMessages.en, user: { ...admin }, handleApiError: vi.fn(), endRevokedSession: vi.fn() };
vi.mock("@/components/staff/staff-auth-provider", () => ({ useStaffAuth: () => state }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }), usePathname: () => "/en/staff/team" }));
beforeEach(() => {
  vi.resetAllMocks(); state.user = { ...admin }; state.locale = "en"; state.copy = staffMessages.en;
  api.listStaff.mockResolvedValue(page()); api.getStaff.mockResolvedValue(other); api.mutateStaff.mockResolvedValue(other); api.inviteStaff.mockResolvedValue(pending); api.listAuditLogs.mockResolvedValue(auditPage("future.unknown"));
});
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }

describe("admin-only team governance", () => {
  it.each(["receptionist", "dentist"])("denies %s with zero staff/audit reads and preserves the signed-in principal", async (role) => {
    state.user.role = role;
    render(<><StaffTeamManagement /><StaffAuditManagement /></>);
    expect(screen.getAllByText("Access denied")).toHaveLength(2);
    await Promise.resolve(); expect(api.listStaff).not.toHaveBeenCalled(); expect(api.listAuditLogs).not.toHaveBeenCalled(); expect(state.user.role).toBe(role);
  });
  it("sends an exact invite, refetches uncertainty once, and never shows tokens", async () => {
    api.inviteStaff.mockRejectedValueOnce(new StaffApiError({ kind: "timeout" }));
    render(<StaffTeamManagement />); await screen.findByText("Other");
    fireEvent.click(screen.getByRole("button", { name: "Invite staff" }));
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.change(dialog.getByLabelText("Staff name"), { target: { value: " New Staff " } });
    fireEvent.change(dialog.getByLabelText("Email address"), { target: { value: "new@example.test" } });
    fireEvent.click(dialog.getByRole("button", { name: "Invite staff" }));
    expect(await screen.findByText(/Invitation outcome is uncertain/)).toBeVisible();
    expect(api.inviteStaff).toHaveBeenCalledExactlyOnceWith({ name: "New Staff", email: "new@example.test", role: "receptionist" });
    await waitFor(() => expect(api.listStaff).toHaveBeenCalledTimes(2));
  });
  it("freezes the target during refresh and makes a last-admin conflict actionable without retry", async () => {
    api.mutateStaff.mockRejectedValueOnce(new StaffApiError({ kind: "http", status: 409 }));
    render(<StaffTeamManagement />); await screen.findByText("Other");
    fireEvent.click(within(screen.getByTestId(`staff-${other.id}`)).getByRole("button", { name: "Change role" }));
    const dialog = within(screen.getByRole("dialog"));
    api.listStaff.mockResolvedValueOnce(page([self, member("64b000000000000000000099", "Replacement")]));
    // A background refresh is simulated while the modal correctly makes the
    // underlying workspace inert to real pointer/keyboard users.
    fireEvent.click(screen.getByRole("button", { name: "Refresh", hidden: true }));
    await screen.findByText("Replacement");
    expect(dialog.getByText("Other")).toBeVisible();
    fireEvent.change(dialog.getByLabelText("Role"), { target: { value: "receptionist" } });
    fireEvent.click(dialog.getByRole("button", { name: "Confirm change" }));
    expect(await screen.findByText(/protect self-access or the last active administrator/)).toBeVisible();
    expect(api.mutateStaff).toHaveBeenCalledExactlyOnceWith(other.id, "role", "receptionist");
    await waitFor(() => expect(api.listStaff).toHaveBeenCalledTimes(3));
  });
  it.each([["Other", other.id, "Deactivate staff", "deactivate"], ["Inactive", inactive.id, "Reactivate staff", "reactivate"], ["Other", other.id, "Revoke all sessions", "revoke-sessions"]])("confirms %s lifecycle action %s against the exact staff ID", async (_name, id, label, action) => {
    render(<StaffTeamManagement />); await screen.findByText("Other");
    fireEvent.click(within(screen.getByTestId(`staff-${id}`)).getByRole("button", { name: label }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm change" }));
    await waitFor(() => expect(api.mutateStaff).toHaveBeenCalledExactlyOnceWith(id, action, "dentist"));
    await waitFor(() => expect(api.listStaff).toHaveBeenCalledTimes(2));
  });
  it("distinguishes pending setup, blocks self actions, and ends self-revocation without invalid-token refetch", async () => {
    api.mutateStaff.mockResolvedValueOnce(self);
    render(<StaffTeamManagement />); await screen.findByText("Other");
    const pendingCard = within(screen.getByTestId(`staff-${pending.id}`));
    expect(pendingCard.getByText("Invitation pending")).toBeVisible(); expect(pendingCard.queryByRole("button", { name: "Reactivate staff" })).toBeNull();
    const selfCard = within(screen.getByTestId(`staff-${admin.id}`));
    expect(selfCard.getByRole("button", { name: "Change role" })).toBeDisabled(); expect(selfCard.getByRole("button", { name: "Deactivate staff" })).toBeDisabled();
    fireEvent.click(selfCard.getByRole("button", { name: "Revoke all sessions" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm change" }));
    await waitFor(() => expect(state.endRevokedSession).toHaveBeenCalledOnce());
    expect(replace).toHaveBeenCalledWith("/en/staff/login"); expect(api.listStaff).toHaveBeenCalledOnce();
  });
  it("can invalidate a pending invitation without falsely making it reactivatable", async () => {
    api.mutateStaff.mockResolvedValueOnce({ ...pending, deactivatedAt: time });
    render(<StaffTeamManagement />); await screen.findByText("Other");
    api.listStaff.mockResolvedValueOnce(page([{ ...pending, deactivatedAt: time }]));
    fireEvent.click(within(screen.getByTestId(`staff-${pending.id}`)).getByRole("button", { name: "Deactivate staff" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm change" }));
    await waitFor(() => expect(within(screen.getByTestId(`staff-${pending.id}`)).getByText("Deactivated")).toBeVisible());
    expect(within(screen.getByTestId(`staff-${pending.id}`)).queryByRole("button", { name: "Reactivate staff" })).toBeNull();
  });
  it("preserves 403 and refuses stale staff filter responses even if the adapter ignores abort", async () => {
    const old = deferred<ReturnType<typeof page>>(); const latest = deferred<ReturnType<typeof page>>();
    render(<StaffTeamManagement />); await screen.findByText("Other");
    api.listStaff.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "dentist" } }); fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "receptionist" } }); fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    await act(async () => latest.resolve(page([member(other.id, "Newest")])));
    await screen.findByText("Newest"); await act(async () => old.resolve(page([member(other.id, "Stale")])));
    expect(screen.queryByText("Stale")).toBeNull(); expect(api.listStaff.mock.calls[1][1].aborted).toBe(true);
    api.mutateStaff.mockRejectedValueOnce(new StaffApiError({ kind: "http", status: 403 }));
    fireEvent.click(within(screen.getByTestId(`staff-${other.id}`)).getByRole("button", { name: "Revoke all sessions" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm change" }));
    expect(await screen.findByText(/signed-in session is preserved/)).toBeVisible(); expect(state.endRevokedSession).not.toHaveBeenCalled();
  });
  it("correlates overlapping selected staff detail loads", async () => {
    const old = deferred<typeof other>(); const latest = deferred<typeof other>();
    api.getStaff.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    render(<StaffTeamManagement />); await screen.findByText("Other");
    fireEvent.click(within(screen.getByTestId(`staff-${other.id}`)).getByRole("button", { name: "View" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    fireEvent.click(within(screen.getByTestId(`staff-${inactive.id}`)).getByRole("button", { name: "View" }));
    await act(async () => latest.resolve(inactive)); await act(async () => old.resolve(other));
    expect(within(screen.getByRole("dialog")).getByText(inactive.id)).toBeVisible(); expect(within(screen.getByRole("dialog")).queryByText(other.id)).toBeNull();
  });
});

describe("read-only audit administration", () => {
  it("uses UTC server filters and validates reversed ranges without a new read", async () => {
    render(<StaffAuditManagement />); await screen.findAllByText("future.unknown");
    fireEvent.change(screen.getByLabelText("Action code"), { target: { value: "staff.invited" } });
    fireEvent.change(screen.getByLabelText("From (UTC)"), { target: { value: "2026-09-15T08:00" } });
    fireEvent.change(screen.getByLabelText("To (UTC)"), { target: { value: "2026-09-15T09:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    await waitFor(() => expect(api.listAuditLogs).toHaveBeenCalledTimes(2));
    expect(api.listAuditLogs.mock.calls[1][0]).toMatchObject({ action: "staff.invited", from: time, to: "2026-09-15T09:00:00.000Z" });
    fireEvent.change(screen.getByLabelText("From (UTC)"), { target: { value: "2026-09-16T08:00" } }); fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(await screen.findByText(/From not later than To/)).toBeVisible(); expect(api.listAuditLogs).toHaveBeenCalledTimes(2);
  });
  it("ignores a stale audit response, handles unknown codes/null actor, and renders metadata as text", async () => {
    const old = deferred<ReturnType<typeof auditPage>>(); const latest = deferred<ReturnType<typeof auditPage>>();
    render(<StaffAuditManagement />); await screen.findAllByText("future.unknown");
    api.listAuditLogs.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    fireEvent.change(screen.getByLabelText("Action code"), { target: { value: "old" } }); fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    fireEvent.change(screen.getByLabelText("Action code"), { target: { value: "new" } }); fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    await act(async () => latest.resolve(auditPage("future.new"))); await act(async () => old.resolve(auditPage("future.stale")));
    expect(screen.queryByText("future.stale")).toBeNull(); expect(screen.getAllByText("System or unavailable staff").length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: "View" })[0]);
    expect(within(screen.getByRole("dialog")).getByText("<img src=x onerror=alert(1)>")).toBeVisible(); expect(screen.queryByRole("img")).toBeNull();
  });
  it("fails safely for malformed metadata", () => {
    render(<AuditMetadataView value={{ nested: { patientName: "private" } }} />);
    expect(screen.getByRole("alert")).toBeVisible(); expect(screen.queryByText("private")).toBeNull();
  });
});
