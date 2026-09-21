"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { UserPlus } from "lucide-react";
import { StaffApiError, type StaffRole } from "@/api/staff-client";
import { localizedPersonName, localizedStaffName } from '@/i18n/localized-content';
import { productMessages } from '@/i18n/product-messages';
import type { StaffDentist } from '@/api/staff-management';
import type { GovernedStaff, StaffFilters } from "@/api/staff-governance";
import { useStaffAuth } from "@/components/staff/staff-auth-provider";
import { StaffAccessDenied } from "@/components/staff/staff-shell";
import { ManagementHeader, fieldClass, labelClass, useManagementCopy } from "@/components/staff/staff-management-shared";
import { GovernanceFeedback, GovernancePaginationControls, governanceTimestamp, useGovernanceCopy, useRoleLabel } from "@/components/staff/staff-governance-shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

import { correctiveMessages } from '@/i18n/corrective-messages';
import { staffOnboardingMessages } from '@/i18n/staff-onboarding-messages';
import { isHumanName, isEmail } from '../../../../shared/booking-input.mjs';

const initialFilters: StaffFilters = { lifecycle: 'active', page: 1, limit: 12 };
type StaffAction = "role" | "deactivate" | "reactivate" | "revoke-sessions" | "resend-invitation" | "cancel-invitation";
type Review = { target: GovernedStaff; action: StaffAction; role: StaffRole; dentistProfileId: string };

export function StaffTeamManagement() {
  const { user } = useStaffAuth();
  // No protected child mounts (and therefore no reads) for a denied principal.
  return user?.role === "admin" ? <TeamWorkspace /> : <StaffAccessDenied />;
}

function TeamWorkspace() {
  const { api, copy, locale, user, handleApiError, endRevokedSession } = useStaffAuth();
  const gov = useGovernanceCopy();
  const text = correctiveMessages[locale];
  const onboarding = staffOnboardingMessages[locale];
  const [timezone, setTimezone] = useState<string | null>(null);
  const [inviteValidation, setInviteValidation] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void api.getClinic(controller.signal).then((clinic) => { if (!controller.signal.aborted) setTimezone(clinic.timezone); }, (error: unknown) => { if (!controller.signal.aborted) handleApiError(error); });
    return () => controller.abort();
  }, [api, handleApiError]);
  const roleLabel = useRoleLabel();
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteDentistQuery = searchParams.get('inviteDentist');
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
  const [invitation, setInvitation] = useState({ name: "", email: "", role: "receptionist" as StaffRole, dentistProfileId: "" });
  const [dentistChoices, setDentistChoices] = useState<StaffDentist[]>([]);
  const [dentistLinksResult, setDentistLinksResult] = useState<{ key: string; links: Set<string> } | null>(null);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const handledQuery = useRef<string | null>(null);
  const key = JSON.stringify([filters, revision]);
  const current = result?.key === key ? result.data : null;
  const loading = !current && loadError?.key !== key;
  const dentistLinksKey = JSON.stringify([inviteOpen, invitation.role, inviteDentistQuery, review?.action, review?.role, review?.target.role, revision]);
  const dentistLinksLoaded = dentistLinksResult?.key === dentistLinksKey;
  const currentDentistLinks = useMemo(
    () => dentistLinksLoaded ? dentistLinksResult.links : new Set<string>(),
    [dentistLinksLoaded, dentistLinksResult],
  );

  useEffect(() => {
    const controller = new AbortController();
    void api.listDentists(controller.signal).then((dentists) => {
      if (!controller.signal.aborted) setDentistChoices(dentists);
    }, (error: unknown) => { if (!controller.signal.aborted) handleApiError(error); });
    return () => controller.abort();
  }, [api, handleApiError, revision]);

  useEffect(() => {
    if (!(inviteOpen && invitation.role === 'dentist') && !(review?.action === 'role' && review.role === 'dentist' && review.target.role !== 'dentist') && !inviteDentistQuery) return;
    const controller = new AbortController();
    void api.listStaff({ lifecycle: 'current', page: 1, limit: 100 }, controller.signal).then((linkedStaff) => {
      if (!controller.signal.aborted) {
        setDentistLinksResult({
          key: dentistLinksKey,
          links: new Set(linkedStaff.staff.flatMap((member) => member.dentistProfile ? [member.dentistProfile] : [])),
        });
      }
    }, (error: unknown) => { if (!controller.signal.aborted) handleApiError(error); });
    return () => controller.abort();
  }, [api, dentistLinksKey, handleApiError, invitation.role, inviteDentistQuery, inviteOpen, review?.action, review?.role, review?.target.role]);

  useEffect(() => {
    const dentistId = inviteDentistQuery;
    if (!dentistId || handledQuery.current === `invite:${dentistId}` || !dentistChoices.length || !dentistLinksLoaded) return;
    let active = true;
    if (currentDentistLinks.has(dentistId)) {
      handledQuery.current = `invite:${dentistId}`;
      queueMicrotask(() => { if (active) setFeedback({ error: true, message: gov.inviteConflict }); });
      return () => { active = false; };
    }
    const dentist = dentistChoices.find((item) => item._id === dentistId);
    if (!dentist) return;
    handledQuery.current = `invite:${dentistId}`;
    queueMicrotask(() => {
      if (!active) return;
      setInvitation({ name: localizedPersonName(dentist, locale), email: '', role: 'dentist', dentistProfileId: dentist._id });
      setInviteValidation(null);
      setInviteOpen(true);
    });
    return () => { active = false; };
  }, [currentDentistLinks, dentistChoices, dentistLinksLoaded, gov.inviteConflict, inviteDentistQuery, locale]);

  useEffect(() => {
    const staffId = searchParams.get('staff');
    const view = searchParams.get('view');
    if (!staffId || handledQuery.current === `staff:${staffId}`) return;
    const lifecycleFilter = view === 'archive' ? 'deactivated' : view === 'pending' ? 'pending' : 'active';
    if (filters.lifecycle !== lifecycleFilter) {
      const next = { ...initialFilters, lifecycle: lifecycleFilter as StaffFilters['lifecycle'] };
      let active = true;
      queueMicrotask(() => { if (active) { setDraft(next); setFilters(next); } });
      return () => { active = false; };
    }
    const target = current?.staff.find((member) => member.id === staffId);
    if (!target) return;
    let active = true;
    handledQuery.current = `staff:${staffId}`;
    queueMicrotask(() => {
      if (!active) return;
      setSelected({ ...target }); setDetail(null); setDetailError(false);
    });
    return () => { active = false; };
  }, [current, filters.lifecycle, searchParams]);

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
  function lifecycle(staff: GovernedStaff) { return !staff.isSetupComplete ? staff.deactivatedAt ? onboarding.cancelled : gov.pending : staff.isActive ? gov.active : onboarding.deactivated; }
  function openDetail(staff: GovernedStaff) { setSelected({ ...staff }); setDetail(null); setDetailError(false); }
  function openReview(target: GovernedStaff, action: StaffAction) {
    setReview({ target: { ...target }, action, role: target.role, dentistProfileId: target.dentistProfile ?? '' });
  }
  async function mutate() {
    if (!review || busy.current) return;
    const frozen = review;
    busy.current = true; setPending(true);
    try {
      if (frozen.action === 'role' && frozen.role === 'dentist') {
        await api.mutateStaff(frozen.target.id, frozen.action, frozen.role, frozen.dentistProfileId);
      }
      else {
        await api.mutateStaff(frozen.target.id, frozen.action, frozen.role);
      }
      if (frozen.action === "revoke-sessions" && frozen.target.id === user?.id) {
        endRevokedSession(); router.replace(`/${locale}/staff/login` as Route); return;
      }
      setFeedback({ error: false, message: frozen.action === 'resend-invitation' ? gov.invited.replace('{email}', frozen.target.email) : gov.changed });
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
    if (!isHumanName(invitation.name, 100) || !isEmail(invitation.email, true)) {
      setInviteValidation(!isHumanName(invitation.name, 100) ? text.invalidName : text.invalidEmail); return;
    }
    if (invitation.role === 'dentist' && !invitation.dentistProfileId) {
      setInviteValidation(onboarding.dentistProfileHelp); return;
    }
    setInviteValidation(null);
    busy.current = true; setPending(true);
    const exact = { name: invitation.name.trim(), email: invitation.email.trim(), role: invitation.role,
      ...(invitation.role === 'dentist' ? { dentistProfileId: invitation.dentistProfileId } : {}) };
    try { await api.inviteStaff(exact); setFeedback({ error: false, message: gov.invited.replace('{email}', exact.email) }); }
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
      {staff.isActive && staff.isSetupComplete && <><Button size="sm" variant="destructive" disabled={self || pending} title={self ? gov.selfAction : undefined} onClick={() => openReview(staff, "deactivate")}>{gov.deactivate}</Button><Button size="sm" variant="ghost" disabled={pending} onClick={() => openReview(staff, "revoke-sessions")}>{gov.revoke}</Button></>}
      {!staff.isSetupComplete && !staff.deactivatedAt && <><Button size="sm" variant="outline" disabled={pending} onClick={() => openReview(staff, 'resend-invitation')}>{text.resend}</Button><Button size="sm" variant="destructive" disabled={pending} onClick={() => openReview(staff, 'cancel-invitation')}>{text.cancelInvitation}</Button></>}
      {!staff.isActive && staff.isSetupComplete && <Button size="sm" variant="secondary" disabled={pending} onClick={() => openReview(staff, "reactivate")}>{onboarding.restoreEmployee}</Button>}
    </div>;
  }
  const reviewLabel = review ? review.action === "role" ? gov.changeRole : review.action === "deactivate" ? gov.deactivate : review.action === 'cancel-invitation' ? text.cancelInvitation : review.action === 'resend-invitation' ? text.resend : review.action === "reactivate" ? onboarding.restoreEmployee : gov.revoke : "";
  const reviewBody = review ? review.action === "role" ? gov.roleHelp : review.action === "deactivate" ? review.target.role === 'dentist' ? onboarding.deactivateDentistHelp : onboarding.deactivateEmployeeHelp : review.action === 'cancel-invitation' ? gov.deactivateHelp : review.action === 'resend-invitation' ? text.resendHelp : review.action === "reactivate" ? onboarding.restoreHelp : gov.revokeHelp : "";
  return <div className="min-w-0">
    <ManagementHeader eyebrow={copy.secureArea} title={gov.teamTitle} intro={gov.teamIntro} action={<Button onClick={() => { setInvitation({ name: "", email: "", role: "receptionist", dentistProfileId: "" }); setInviteValidation(null); setInviteOpen(true); }} disabled={pending}><UserPlus aria-hidden="true" />{gov.invite}</Button>} />
    <GovernanceFeedback value={feedback} />
    <form className="mt-8 grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2 xl:grid-cols-4" onSubmit={(event) => { event.preventDefault(); setFilters({ ...draft, page: 1 }); }}>
      <label className={labelClass}>{copy.role}<select aria-label={copy.role} className={fieldClass} value={draft.role ?? ""} onChange={(event) => setDraft({ ...draft, role: event.target.value ? event.target.value as StaffRole : undefined })}><option value="">{gov.allRoles}</option>{(["admin", "receptionist", "dentist"] as const).map((value) => <option key={value} value={value}>{roleLabel(value)}</option>)}</select></label>
      <label className={labelClass}>{copy.status}<select aria-label={copy.status} className={fieldClass} value={draft.lifecycle ?? 'active'} onChange={(event) => setDraft({ ...draft, lifecycle: event.target.value as StaffFilters['lifecycle'] })}>{(['active', 'pending', 'deactivated'] as const).map((value) => <option key={value} value={value}>{value === 'active' ? onboarding.currentView : value === 'pending' ? onboarding.pendingView : onboarding.archiveView}</option>)}</select></label>
      <div className="flex flex-wrap items-end gap-2"><Button type="submit">{copy.applyFilters}</Button><Button type="button" variant="outline" onClick={() => { setDraft(initialFilters); setFilters(initialFilters); refresh(); }}>{copy.clearFilters}</Button></div>
    </form>
    <div className="mt-6 flex justify-end"><Button variant="outline" onClick={refresh} disabled={pending}>{copy.refresh}</Button></div>
    {loading && <p role="status" className="mt-6">{gov.loadingTeam}</p>}
    {loadError?.key === key && <GovernanceFeedback value={{ error: true, message: loadError.message }} />}
    {current && <>
      {!current.staff.length && <p role="status" className="mt-6">{gov.emptyTeam}</p>}
      <ul className="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-3" aria-label={gov.teamNav}>
        {current.staff.map((staff) => <li key={staff.id} className="min-w-0 rounded-xl border bg-card p-5" data-testid={`staff-${staff.id}`}>
          <div className="flex flex-wrap items-start justify-between gap-2"><h2 className="break-words font-semibold">{localizedStaffName(staff, locale)}{staff.id === user?.id && <span className="ml-2 text-xs text-muted-foreground">({gov.you})</span>}</h2><span className="rounded-full bg-secondary px-2 py-1 text-xs font-semibold">{lifecycle(staff)}</span></div>
          <p className="mt-2 break-all text-sm text-muted-foreground">{staff.email}</p><p className="mt-2 text-sm">{roleLabel(staff.role)} · {!staff.isSetupComplete ? gov.setupPending : gov.setupComplete}</p>
          {staff.id === user?.id && <p className="mt-3 text-xs text-muted-foreground">{gov.selfAction}</p>}
          <div className="mt-5">{actions(staff)}</div>
        </li>)}
      </ul><GovernancePaginationControls value={current.pagination} pending={pending} onPage={(page) => setFilters({ ...filters, page })} />
    </>}
    <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}><DialogContent closeLabel={copy.close}>
      <DialogTitle>{gov.details}</DialogTitle><DialogDescription className="mt-3 break-words">{selected && localizedStaffName(selected, locale)} · {selected?.email}</DialogDescription>
      {detailError ? <GovernanceFeedback value={{ error: true, message: gov.loadError }} /> : detail && detail.id === selected?.id ? <dl className="mt-5 space-y-3 break-words">
        <div><dt className="text-sm text-muted-foreground">{productMessages[locale].advanced}</dt><dd><details><summary className="min-h-11 cursor-pointer">{gov.staffId}</summary><p className="break-all">{detail.id}</p></details></dd></div>
        <div><dt className="text-sm text-muted-foreground">{copy.role}</dt><dd>{roleLabel(detail.role)}</dd></div>
        <div><dt className="text-sm text-muted-foreground">{copy.status}</dt><dd>{lifecycle(detail)}</dd></div>
        <div><dt className="text-sm text-muted-foreground">{copy.created}</dt><dd>{timezone ? governanceTimestamp(detail.createdAt, locale, timezone) : gov.loadingTeam}</dd></div>
        {detail.deactivatedAt && <div><dt className="text-sm text-muted-foreground">{gov.deactivatedAt}</dt><dd>{timezone ? governanceTimestamp(detail.deactivatedAt, locale, timezone) : gov.loadingTeam}</dd></div>}
      </dl> : <p role="status" className="mt-5">{gov.loadingTeam}</p>}
      {detail?.role === 'dentist' && detail.id === selected?.id && <DentistAssignment key={detail.id} staffId={detail.id} />}
    </DialogContent></Dialog>
    <Dialog open={Boolean(review)} onOpenChange={(open) => !open && !busy.current && setReview(null)}><DialogContent closeLabel={copy.close}>
      <DialogTitle>{reviewLabel}</DialogTitle><DialogDescription className="mt-3">{reviewBody}</DialogDescription>
      <p className="mt-4 break-words font-semibold">{review && localizedStaffName(review.target, locale)}</p><p className="break-all text-sm text-muted-foreground">{review?.target.email} · {review?.target.id}</p>
      {review?.action === "revoke-sessions" && review.target.id === user?.id && <p className="mt-4 text-sm">{gov.selfRevokeHelp}</p>}
      {review?.action === "role" && <>
        <label className={`${labelClass} mt-5`}>{copy.role}<select aria-label={copy.role} value={review.role} disabled={pending} className={fieldClass} onChange={(event) => {
          const role = event.target.value as StaffRole;
          setReview({ ...review, role, dentistProfileId: role === 'dentist' ? review.dentistProfileId : '' });
        }}>{(["admin", "receptionist", "dentist"] as const).map((value) => <option key={value} value={value}>{roleLabel(value)}</option>)}</select></label>
        {review.role === 'dentist' && <label className={`${labelClass} mt-4`}>{onboarding.dentistProfile}<select aria-label={onboarding.dentistProfile} className={fieldClass} required value={review.dentistProfileId} disabled={pending || !dentistLinksLoaded} onChange={(event) => setReview({ ...review, dentistProfileId: event.target.value })}><option value="">—</option>{dentistChoices.filter((item) => !currentDentistLinks.has(item._id) || item._id === review.target.dentistProfile).map((item) => <option key={item._id} value={item._id}>{localizedPersonName(item, locale)}</option>)}</select></label>}
      </>}
      <div className="mt-6 flex flex-wrap justify-end gap-3"><Button variant="outline" disabled={pending} onClick={() => setReview(null)}>{copy.close}</Button><Button variant="destructive" disabled={pending || (review?.action === "role" && (review.role === review.target.role || (review.role === 'dentist' && !review.dentistProfileId)))} onClick={() => void mutate()}>{pending ? copy.updating : gov.confirm}</Button></div>
    </DialogContent></Dialog>
    <Dialog open={inviteOpen} onOpenChange={(open) => !busy.current && setInviteOpen(open)}><DialogContent closeLabel={copy.close}>
      <DialogTitle>{gov.inviteTitle}</DialogTitle><DialogDescription className="mt-3">{gov.inviteHelp}</DialogDescription>
      <form className="mt-5 space-y-4" onSubmit={(event) => void invite(event)} noValidate>
        {inviteValidation && <p role="alert" className="text-sm text-destructive">{inviteValidation}</p>}
        <label className={labelClass}>{gov.staffName}<input className={fieldClass} required minLength={2} maxLength={100} autoComplete="name" value={invitation.name} disabled={pending} onChange={(event) => setInvitation({ ...invitation, name: event.target.value })} /></label>
        <label className={labelClass}>{copy.email}<input className={fieldClass} type="email" required maxLength={254} autoComplete="email" value={invitation.email} disabled={pending} onChange={(event) => setInvitation({ ...invitation, email: event.target.value })} /></label>
        <label className={labelClass}>{copy.role}<select aria-label={copy.role} className={fieldClass} value={invitation.role} disabled={pending} onChange={(event) => setInvitation({ ...invitation, role: event.target.value as StaffRole })}>{(["admin", "receptionist", "dentist"] as const).map((value) => <option key={value} value={value}>{roleLabel(value)}</option>)}</select></label>
        {invitation.role === 'dentist' && <div><label className={labelClass}>{onboarding.dentistProfile}<select aria-label={onboarding.dentistProfile} className={fieldClass} required value={invitation.dentistProfileId} disabled={pending || !dentistLinksLoaded} onChange={(event) => {
          const dentistProfileId = event.target.value;
          const dentist = dentistChoices.find((item) => item._id === dentistProfileId);
          setInvitation({ ...invitation, dentistProfileId, ...(dentist && !invitation.name.trim() ? { name: localizedPersonName(dentist, locale) } : {}) });
        }}><option value="">—</option>{dentistChoices.filter((item) => !currentDentistLinks.has(item._id)).map((item) => <option key={item._id} value={item._id}>{localizedPersonName(item, locale)}</option>)}</select></label><p className="mt-2 text-sm text-muted-foreground">{onboarding.dentistProfileHelp}</p>{dentistLinksLoaded && dentistChoices.every((item) => currentDentistLinks.has(item._id)) && !invitation.dentistProfileId && <p className="mt-2 text-sm"><span>{onboarding.noEligibleDentists}</span> <Link className="font-semibold text-primary underline" href={`/${locale}/staff/dentists` as Route}>{onboarding.createDentistProfile}</Link></p>}</div>}
        <div className="flex flex-wrap justify-end gap-3"><Button type="button" variant="outline" disabled={pending} onClick={() => setInviteOpen(false)}>{copy.close}</Button><Button type="submit" disabled={pending}>{pending ? copy.sending : gov.invite}</Button></div>
      </form>
    </DialogContent></Dialog>
  </div>;
}

function DentistAssignment({ staffId }: { staffId: string }) {
  const { api, locale, copy, handleApiError } = useStaffAuth();
  const management = useManagementCopy();
  const text = productMessages[locale];
  const [state, setState] = useState<{ dentists: StaffDentist[]; original: string; selected: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const active = useRef(true);
  const busy = useRef(false);
  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    void Promise.all([api.listDentists(controller.signal), api.getDentistProfile(staffId, controller.signal)]).then(([dentists, dentistId]) => {
      if (!controller.signal.aborted) setState({ dentists, original: dentistId ?? '', selected: dentistId ?? '' });
    }, (error) => { if (!controller.signal.aborted) { handleApiError(error); setFeedback(copy.appointmentsError); } });
    return () => { active.current = false; controller.abort(); };
  }, [api, copy.appointmentsError, handleApiError, staffId]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!state || busy.current) return;
    busy.current = true; setPending(true); setFeedback(null);
    try {
      if (!state.selected) return;
      const dentistId = await api.setDentistProfile(staffId, state.selected);
      if (active.current) { setState({ ...state, original: dentistId ?? '', selected: dentistId ?? '' }); setFeedback(text.assignmentSaved); }
    } catch (error) { if (active.current) { handleApiError(error); setFeedback(copy.networkError); } }
    finally { busy.current = false; if (active.current) setPending(false); }
  }
  return <form onSubmit={(event) => void save(event)} className="mt-6 space-y-3 border-t pt-5">
    <label className={labelClass}>{text.doctorAssignment}<select className={fieldClass} disabled={!state || pending} value={state?.selected ?? ''} onChange={(event) => state && setState({ ...state, selected: event.target.value })}><option value="" disabled>—</option>{state?.dentists.map((item) => <option key={item._id} value={item._id}>{localizedPersonName(item, locale) || text.untranslated}</option>)}</select></label>
    <p className="text-sm text-muted-foreground">{text.assignmentHelp}</p>
    {feedback && <p role="status" className="text-sm">{feedback}</p>}
    <Button type="submit" disabled={!state || pending || !state.selected || state.selected === state.original}>{pending ? copy.updating : management.save}</Button>
  </form>;
}
