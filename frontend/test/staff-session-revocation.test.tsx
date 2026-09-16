import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { staffApi } from "@/api/staff-client";
import { StaffAuthProvider, useStaffAuth } from "@/components/staff/staff-auth-provider";
afterEach(() => vi.restoreAllMocks());
function Probe() {
  const auth = useStaffAuth();
  return <><p>{auth.status}</p><p>{auth.user?.name ?? "no principal"}</p><p>{auth.notice}</p><button onClick={auth.endRevokedSession}>End revoked session</button></>;
}
it("ends a revoked local session, clears the in-memory client, and publishes cross-tab clear without logout/refetch", async () => {
  vi.spyOn(staffApi, "bootstrap").mockResolvedValue({ id: "64b000000000000000000091", name: "Admin", email: "admin@example.test", role: "admin" });
  const clear = vi.spyOn(staffApi, "clearSession"); const logout = vi.spyOn(staffApi, "logout");
  render(<StaffAuthProvider locale="en"><Probe /></StaffAuthProvider>);
  await screen.findByText("authenticated");
  fireEvent.click(screen.getByRole("button", { name: "End revoked session" }));
  await waitFor(() => expect(screen.getByText("anonymous")).toBeVisible());
  expect(screen.getByText("no principal")).toBeVisible(); expect(screen.getByText("Your session has ended. Sign in again.")).toBeVisible();
  expect(clear).toHaveBeenCalledOnce(); expect(logout).not.toHaveBeenCalled(); expect(staffApi.bootstrap).toHaveBeenCalledOnce();
});
