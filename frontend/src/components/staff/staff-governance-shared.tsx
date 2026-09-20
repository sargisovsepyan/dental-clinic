"use client";
import { useStaffAuth } from "@/components/staff/staff-auth-provider";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { staffGovernanceMessages } from "@/i18n/staff-governance-messages";
import type { GovernancePagination } from "@/api/staff-governance";
import type { StaffRole } from "@/api/staff-client";

export function useGovernanceCopy() { return staffGovernanceMessages[useStaffAuth().locale]; }
export function useRoleLabel() {
  const { copy } = useStaffAuth();
  return (role: StaffRole) => role === "admin" ? copy.roleAdmin : role === "receptionist" ? copy.roleReceptionist : copy.roleDentist;
}
export function governanceTimestamp(value: string, locale: "hy" | "ru" | "en", timezone = 'UTC') {
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: timezone, timeZoneName: "short" }).format(new Date(value));
}
export function GovernanceFeedback({ value }: { value: { message: string; error: boolean } | null }) {
  return value ? <Alert className="mt-6" variant={value.error ? "destructive" : "default"} role={value.error ? "alert" : "status"}><AlertDescription>{value.message}</AlertDescription></Alert> : null;
}
export function GovernancePaginationControls({ value, pending, onPage }: { value: GovernancePagination; pending: boolean; onPage: (page: number) => void }) {
  const { copy } = useStaffAuth();
  const gov = useGovernanceCopy();
  return <nav aria-label={copy.page.replace("{page}", String(value.page)).replace("{pages}", String(Math.max(1, value.pages)))} className="mt-6 flex flex-wrap items-center justify-between gap-3">
    <p className="text-sm text-muted-foreground">{copy.page.replace("{page}", String(value.page)).replace("{pages}", String(Math.max(1, value.pages)))} · {gov.total}: {value.total}</p>
    <div className="flex gap-2"><Button variant="outline" disabled={pending || value.page <= 1} onClick={() => onPage(value.page - 1)}>{copy.previous}</Button><Button variant="outline" disabled={pending || value.page >= value.pages} onClick={() => onPage(value.page + 1)}>{copy.next}</Button></div>
  </nav>;
}
