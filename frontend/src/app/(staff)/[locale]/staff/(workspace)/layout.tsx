import { StaffWorkspaceShell } from "@/components/staff/staff-shell";

export default function AuthenticatedStaffLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <StaffWorkspaceShell>{children}</StaffWorkspaceShell>;
}
