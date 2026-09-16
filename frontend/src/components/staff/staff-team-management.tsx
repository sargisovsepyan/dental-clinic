"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { UserPlus } from "lucide-react";
import { StaffApiError, type StaffRole } from "@/api/staff-client";
import type { GovernedStaff, StaffFilters } from "@/api/staff-governance";
import { useStaffAuth } from "@/components/staff/staff-auth-provider";
import { StaffAccessDenied } from "@/components/staff/staff-shell";
import { ManagementHeader, fieldClass, labelClass } from "@/components/staff/staff-management-shared";
import { GovernanceFeedback, GovernancePaginationControls, governanceTimestamp, useGovernanceCopy, useRoleLabel } from "@/components/staff/staff-governance-shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const initialFilters: StaffFilters = { page: 1, limit: 12 };
type StaffAction = "role" | "deactivate" | "reactivate" | "revoke-sessions";
type Review = { target: GovernedStaff; action: StaffAction; role: StaffRole };

export function StaffTeamManagement() {
  const { user } = useStaffAuth();
  // No protected child mounts (and therefore no reads) for a denied principal.
  return user?.role === "admin" ? <TeamWorkspace /> : <StaffAccessDenied />;
}

function TeamWorkspace() {
  const { api, copy, locale, user, handleApiError, endRevokedSession } = useStaffAuth();
  const gov = useGovernanceCopy();
  const roleLabel = useRoleLabel();
  const router = useRouter();
  const [draft, setDraft] = useState<StaffFilters>(initialFilters);
  const [filters, setFilters] = useState<StaffFilters>(initialFilters);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; data: Awaited<ReturnType<typeof api.listStaff>> } | null>(null);
  const [loadError, setLoadError] = useState<{ key: string; message: string } | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; error: boolean } | null>(null);
  const [selected, setSelected] = useState<GovernedStaff | null>(null);
  const [detail, setDetail] = useState<GovernedStaff | null>(null);
  const [detailError, setDetailError] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitation, setInvitation] = useState({ name: "", email: "", role: "receptionist" as StaffRole });
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const key = JSON.stringify([filters, revision]);
  const current = result?.key === key ? result.data : null;
  const loading = !current && loadError?.key !== key;

  useEffect(() => {
    const controller = new AbortController();
    void api.listStaff(filters, controller.signal).then((data) => {
      if (!controller.signal.aborted) setResult({ key, data });
    }, (error: unknown) => {
      if (controller.signal.aborted) return;
      handleApiError(error);
      setLoadError({ key, message: error instanceof StaffApiError && error.status === 403 ? gov.forbidden : gov.loadError });
    });
    return () => controller.abort();
  }, [api, filters, gov.forbidden, gov.loadError, handleApiError, key]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    void api.getStaff(selected.id, controller.signal).then((data) => {
      if (!controller.signal.aborted) setDetail(data);
    }, (error: unknown) => {
      if (controller.signal.aborted) return;
      handleApiError(error); setDetailError(true);
    });
    return () => controller.abort();
  }, [api, handleApiError, selected, revision]);

  function refresh() { setRevision((value) => value + 1); setDetail(null); setDetailError(false); }
  function lifecycle(staff: GovernedStaff) { return !staff.isSetupComplete && !staff.deactivatedAt ? gov.pending : staff.isActive ? gov.active : gov.inactive; }
  function openDetail(staff: GovernedStaff) { setSelected({ ...staff }); setDetail(null); setDetailError(false); }
  function openReview(target: GovernedStaff, action: StaffAction) { setReview({ target: { ...target }, action, role: target.role }); }
  async function mutate() {
    if (!review || busy.current) return;
    const frozen = review;
    busy.current = true; setPending(true);
    try {
      await api.mutateStaff(frozen.target.id, frozen.action, frozen.role);
      if (frozen.action === "revoke-sessions" && frozen.target.id === user?.id) {
        endRevokedSession(); router.replace(`/${locale}/staff/login` as Route); return;
      }
      setFeedback({ error: false, message: gov.changed });
    } catch (error) {
      handleApiError(error);
      const conflict = error instanceof StaffApiError && error.status === 409;
      const uncertain = !(error instanceof StaffApiError) || ["network", "timeout", "cancelled", "protocol"].includes(error.kind) || error.status >= 500;
      setFeedback({ error: true, message: error instanceof StaffApiError && error.status === 403 ? gov.forbidden : conflict ? frozen.action === "reactivate" ? gov.pendingConflict : gov.governanceConflict : uncertain ? gov.mutationUncertain : gov.mutationError });
    } finally { busy.current = false; setPending(false); setReview(null); }
    refresh();
  }
  async function invite(event: React.FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true; setPending(true);
    const exact = { name: invitation.name.trim(), email: invitation.email.trim(), role: invitation.role };
    try { await api.inviteStaff(exact); setFeedback({ error: false, message: gov.invited }); }
    catch (error) {
      handleApiError(error);
      const uncertain = !(error instanceof StaffApiError) || ["network", "timeout", "cancelled", "protocol"].includes(error.kind) || error.status >= 500;
      setFeedback({ error: true, message: error instanceof StaffApiError && error.status === 403 ? gov.forbidden : error instanceof StaffApiError && error.status === 409 ? gov.inviteConflict : uncertain ? gov.inviteUncertain : gov.mutationError });
    } finally { busy.current = false; setPending(false); setInviteOpen(false); refresh(); }
  }
  function actions(staff: GovernedStaff) {
    const self = staff.id === user?.id;
    return <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={() => openDetail(staff)}>{copy.view}</Button>
      <Button size="sm" variant="outline" disabled={self || pending} title={self ? gov.selfAction : undefined} onClick={() => openReview(staff, "role")}>{gov.changeRole}</Button>
      {(staff.isActive || (!staff.isSetupComplete && !staff.deactivatedAt))
        ? <Button size="sm" variant="outline" disabled={self || pending} title={self ? gov.selfAction : undefined} onClick={() => openReview(staff, "deactivate")}>{gov.deactivate}</Button>
        : staff.isSetupComplete ? <Button size="sm" variant="outline" disabled={pending} onClick={() => openReview(staff, "reactivate")}>{gov.reactivate}</Button> : null}
      {staff.isSetupComplete && <Button size="sm" variant="outline" disabled={pending} onClick={() => openReview(staff, "revoke-sessions")}>{gov.revoke}</Button>}
    </div>;
  }
  const reviewLabel = review ? review.action === "role" ? gov.changeRole : review.action === "deactivate" ? gov.deactivate : review.action === "reactivate" ? gov.reactivate : gov.revoke : "";
  const reviewBody = review ? review.action === "role" ? gov.roleHelp : review.action === "deactivate" ? gov.deactivateHelp : review.action === "reactivate" ? gov.reactivateHelp : gov.revokeHelp : "";
  return <div className="min-w-0">
    <ManagementHeader eyebrow={copy.secureArea} title={gov.teamTitle} intro={gov.teamIntro} action={<Button onClick={() => { setInvitation({ name: "", email: "", role: "receptionist" }); setInviteOpen(true); }} disabled={pending}><UserPlus aria-hidden="true" />{gov.invite}</Button>} />
    <GovernanceFeedback value={feedback} />
    <form className="mt-8 grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2 xl:grid-cols-4" onSubmit={(event) => { event.preventDefault(); setFilters({ ...draft, page: 1 }); }}>
      <label className={labelClass}>{copy.role}<select aria-label={copy.role} className={fieldClass} value={draft.role ?? ""} onChange={(event) => setDraft({ ...draft, role: event.target.value ? event.target.value as StaffRole : undefined })}><option value="">{gov.allRoles}</option>{(["admin", "receptionist", "dentist"] as const).map((value) => <option key={value} value={value}>{roleLabel(value)}</option>)}</select></label>
      <label className={labelClass}>{copy.status}<select aria-label={copy.status} className={fieldClass} value={draft.isActive === undefined ? "" : String(draft.isActive)} onChange={(event) => setDraft({ ...draft, isActive: event.target.value ? event.target.value === "true" : undefined })}><option value="">{copy.allStatuses}</option><option value="true">{gov.active}</option><option value="false">{gov.inactive} / {gov.pending}</option></select></label>
      <label className={labelClass}>{gov.setup}<select aria-label={gov.setup} className={fieldClass} value={draft.setupComplete === undefined ? "" : String(draft.setupComplete)} onChange={(event) => setDraft({ ...draft, setupComplete: event.target.value ? event.target.value === "true" : undefined })}><option value="">{gov.allSetup}</option><option value="true">{gov.setupComplete}</option><option value="false">{gov.setupPending}</option></select></label>
      <div className="flex flex-wrap items-end gap-2"><Button type="submit">{copy.applyFilters}</Button><Button type="button" variant="outline" onClick={() => { setDraft(initialFilters); setFilters(initialFilters); refresh(); }}>{copy.clearFilters}</Button></div>
    </form>
    <div className="mt-6 flex justify-end"><Button variant="outline" onClick={refresh} disabled={pending}>{copy.refresh}</Button></div>
    {loading && <p role="status" className="mt-6">{gov.loadingTeam}</p>}
    {loadError?.key === key && <GovernanceFeedback value={{ error: true, message: loadError.message }} />}
    {current && <>
      {!current.staff.length && <p role="status" className="mt-6">{gov.emptyTeam}</p>}
      <ul className="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-3" aria-label={gov.teamNav}>
        {current.staff.map((staff) => <li key={staff.id} className="min-w-0 rounded-xl border bg-card p-5" data-testid={`staff-${staff.id}`}>
          <div className="flex flex-wrap items-start justify-between gap-2"><h2 className="break-words font-semibold">{staff.name}{staff.id === user?.id && <span className="ml-2 text-xs text-muted-foreground">({gov.you})</span>}</h2><span className="rounded-full bg-secondary px-2 py-1 text-xs font-semibold">{lifecycle(staff)}</span></div>
          <p className="mt-2 break-all text-sm text-muted-foreground">{staff.email}</p><p className="mt-2 text-sm">{roleLabel(staff.role)} · {!staff.isSetupComplete ? gov.setupPending : gov.setupComplete}</p>
          {staff.id === user?.id && <p className="mt-3 text-xs text-muted-foreground">{gov.selfAction}</p>}
          <div className="mt-5">{actions(staff)}</div>
        </li>)}
      </ul><GovernancePaginationControls value={current.pagination} pending={pending} onPage={(page) => setFilters({ ...filters, page })} />
    </>}
    <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}><DialogContent closeLabel={copy.close}>
      <DialogTitle>{gov.details}</DialogTitle><DialogDescription className="mt-3 break-words">{selected?.name} · {selected?.email}</DialogDescription>
      {detailError ? <GovernanceFeedback value={{ error: true, message: gov.loadError }} /> : detail && detail.id === selected?.id ? <dl className="mt-5 space-y-3 break-words">
        <div><dt className="text-sm text-muted-foreground">{gov.staffId}</dt><dd className="break-all">{detail.id}</dd></div>
        <div><dt className="text-sm text-muted-foreground">{copy.role}</dt><dd>{roleLabel(detail.role)}</dd></div>
        <div><dt className="text-sm text-muted-foreground">{copy.status}</dt><dd>{lifecycle(detail)}</dd></div>
        <div><dt className="text-sm text-muted-foreground">{copy.created}</dt><dd>{governanceTimestamp(detail.createdAt, locale)}</dd></div>
        {detail.deactivatedAt && <div><dt className="text-sm text-muted-foreground">{gov.deactivatedAt}</dt><dd>{governanceTimestamp(detail.deactivatedAt, locale)}</dd></div>}
      </dl> : <p role="status" className="mt-5">{gov.loadingTeam}</p>}
    </DialogContent></Dialog>
    <Dialog open={Boolean(review)} onOpenChange={(open) => !open && !busy.current && setReview(null)}><DialogContent closeLabel={copy.close}>
      <DialogTitle>{reviewLabel}</DialogTitle><DialogDescription className="mt-3">{reviewBody}</DialogDescription>
      <p className="mt-4 break-words font-semibold">{review?.target.name}</p><p className="break-all text-sm text-muted-foreground">{review?.target.email} · {review?.target.id}</p>
      {review?.action === "revoke-sessions" && review.target.id === user?.id && <p className="mt-4 text-sm">{gov.selfRevokeHelp}</p>}
      {review?.action === "role" && <label className={`${labelClass} mt-5`}>{copy.role}<select aria-label={copy.role} value={review.role} disabled={pending} className={fieldClass} onChange={(event) => setReview({ ...review, role: event.target.value as StaffRole })}>{(["admin", "receptionist", "dentist"] as const).map((value) => <option key={value} value={value}>{roleLabel(value)}</option>)}</select></label>}
      <div className="mt-6 flex flex-wrap justify-end gap-3"><Button variant="outline" disabled={pending} onClick={() => setReview(null)}>{copy.close}</Button><Button variant="destructive" disabled={pending || (review?.action === "role" && review.role === review.target.role)} onClick={() => void mutate()}>{pending ? copy.updating : gov.confirm}</Button></div>
    </DialogContent></Dialog>
    <Dialog open={inviteOpen} onOpenChange={(open) => !busy.current && setInviteOpen(open)}><DialogContent closeLabel={copy.close}>
      <DialogTitle>{gov.inviteTitle}</DialogTitle><DialogDescription className="mt-3">{gov.inviteHelp}</DialogDescription>
      <form className="mt-5 space-y-4" onSubmit={(event) => void invite(event)}>
        <label className={labelClass}>{gov.staffName}<input className={fieldClass} required minLength={2} maxLength={100} autoComplete="name" value={invitation.name} disabled={pending} onChange={(event) => setInvitation({ ...invitation, name: event.target.value })} /></label>
        <label className={labelClass}>{copy.email}<input className={fieldClass} type="email" required maxLength={254} autoComplete="email" value={invitation.email} disabled={pending} onChange={(event) => setInvitation({ ...invitation, email: event.target.value })} /></label>
        <label className={labelClass}>{copy.role}<select aria-label={copy.role} className={fieldClass} value={invitation.role} disabled={pending} onChange={(event) => setInvitation({ ...invitation, role: event.target.value as StaffRole })}>{(["admin", "receptionist", "dentist"] as const).map((value) => <option key={value} value={value}>{roleLabel(value)}</option>)}</select></label>
        <div className="flex flex-wrap justify-end gap-3"><Button type="button" variant="outline" disabled={pending} onClick={() => setInviteOpen(false)}>{copy.close}</Button><Button type="submit" disabled={pending || invitation.name.trim().length < 2}>{pending ? copy.sending : gov.invite}</Button></div>
      </form>
    </DialogContent></Dialog>
  </div>;
}
