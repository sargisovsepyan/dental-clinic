"use client";

import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { StaffApiError } from "@/api/staff-client";
import type {
  ClinicClosurePayload,
  ClinicWorkingDay,
  DentistWorkingDay,
  ScheduleExceptionPayload,
  Shift,
  StaffClinic,
  StaffClinicClosure,
  StaffDentist,
  StaffScheduleConflict,
  StaffScheduleException,
} from "@/api/staff-management";
import { useStaffAuth } from "@/components/staff/staff-auth-provider";
import { StaffAccessDenied } from "@/components/staff/staff-shell";
import {
  ConfirmActionDialog,
  fieldClass,
  labelClass,
  ManagementFeedback,
  ManagementHeader,
  managementFeedback,
  useManagementCopy,
  type ManagementFeedbackValue,
} from "@/components/staff/staff-management-shared";
import { ScheduleImpactDialog, WeeklyScheduleEditor } from "@/components/staff/staff-schedule-controls";
import {
  addCalendarDays,
  clinicLocalDate,
  isRealLocalDate,
  normalizeWeeklySchedule,
  serializeWeeklySchedule,
  validateScheduleDays,
  type ScheduleDay,
  type ScheduleKind,
} from "@/components/staff/staff-schedule-helpers";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

type FrozenImpact<T> = {
  operation: T;
  token: string;
  conflicts: StaffScheduleConflict[];
  count: number;
  truncated: boolean;
};

type RequestFence = {
  generation: number;
  controller: AbortController | null;
};

type DateRange = { from: string; to: string };

function sameRange(first: DateRange, second: DateRange) {
  return first.from === second.from && first.to === second.to;
}

function impactFromError<T>(error: StaffApiError, operation: T): FrozenImpact<T> | null {
  if (error.code !== "SCHEDULE_CONFLICT_ACKNOWLEDGEMENT_REQUIRED") return null;
  const details = error.scheduleConflict;
  if (!details?.acknowledgementToken || !details.conflicts || !details.conflictCount) return null;
  return {
    operation,
    token: details.acknowledgementToken,
    conflicts: details.conflicts,
    count: details.conflictCount,
    truncated: details.conflictsTruncated === true,
  };
}

function WeeklyPanel({ kind, schedule, revision, title, pendingGlobal, save, refresh, feedback }: {
  kind: ScheduleKind;
  schedule: ClinicWorkingDay[] | DentistWorkingDay[];
  revision: number;
  title: string;
  pendingGlobal: boolean;
  save: (schedule: ClinicWorkingDay[] | DentistWorkingDay[], revision: number, acknowledgement?: string) => Promise<void>;
  refresh: () => Promise<void>;
  feedback: (value: ManagementFeedbackValue) => void;
}) {
  const copy = useManagementCopy();
  const [days, setDays] = useState<ScheduleDay[]>(() => normalizeWeeklySchedule(schedule, kind));
  const [pending, setPending] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [impact, setImpact] = useState<FrozenImpact<{ schedule: ClinicWorkingDay[] | DentistWorkingDay[]; revision: number }> | null>(null);

  async function attempt(operation: { schedule: ClinicWorkingDay[] | DentistWorkingDay[]; revision: number }, acknowledgement?: string) {
    if (pending || pendingGlobal) return;
    setPending(true); setInvalid(false);
    try {
      await save(operation.schedule, operation.revision, acknowledgement);
      setImpact(null);
      await refresh();
      feedback({ kind: "success", message: copy.scheduleSaved });
    } catch (error) {
      const nextImpact = error instanceof StaffApiError ? impactFromError(error, operation) : null;
      if (nextImpact) {
        setImpact(nextImpact);
      } else {
        setImpact(null);
        if (error instanceof StaffApiError && (error.code === "SCHEDULE_REVISION_CONFLICT" || error.kind === "network" || error.kind === "timeout")) {
          await refresh().catch(() => undefined);
        }
        feedback(managementFeedback(error, copy));
      }
    } finally { setPending(false); }
  }

  function submit() {
    if (!validateScheduleDays(days)) { setInvalid(true); return; }
    const proposal = serializeWeeklySchedule(days, kind).map((day) => ({
      ...day,
      shifts: day.shifts.map((shift) => ({ ...shift })),
    })) as ClinicWorkingDay[] | DentistWorkingDay[];
    void attempt({ schedule: proposal, revision });
  }

  return (
    <section className="rounded-xl border bg-muted/20 p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">{title}</h2><p className="mt-1 text-xs text-muted-foreground">{copy.scheduleRevision}: {revision}</p></div><Button onClick={submit} disabled={pending || pendingGlobal}>{pending ? copy.saving : copy.saveSchedule}</Button></div>
      {invalid && <Alert variant="destructive" className="mb-4"><AlertDescription>{copy.invalidShift}</AlertDescription></Alert>}
      <WeeklyScheduleEditor days={days} onChange={(next) => { setDays(next); setInvalid(false); setImpact(null); }} disabled={pending || pendingGlobal} />
      {impact && <ScheduleImpactDialog open conflicts={impact.conflicts} conflictCount={impact.count} truncated={impact.truncated} pending={pending} onCancel={() => setImpact(null)} onConfirm={() => void attempt(impact.operation, impact.token)} />}
    </section>
  );
}

type OverrideItem = StaffScheduleException | StaffClinicClosure;
type OverrideOperation =
  | { type: "set"; date: string; enabled: boolean; shifts: Shift[]; note: string; revision: number }
  | { type: "delete"; date: string; revision: number };

function OverrideEditor({ mode, value, open, pending, onOpenChange, onSubmit }: {
  mode: "dentist" | "clinic";
  value: OverrideItem | null;
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (operation: Omit<Extract<OverrideOperation, { type: "set" }>, "revision">) => void;
}) {
  const copy = useManagementCopy();
  const initialEnabled = value ? ("isWorking" in value ? value.isWorking : value.isOpen) : false;
  const [date, setDate] = useState(value?.date ?? "");
  const [enabled, setEnabled] = useState(initialEnabled);
  const [shifts, setShifts] = useState<Shift[]>(() => value?.shifts.map((shift) => ({ ...shift })) ?? []);
  const [note, setNote] = useState(value?.note ?? "");
  const [invalid, setInvalid] = useState(false);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const day: ScheduleDay = { dayOfWeek: 1, enabled, shifts: enabled ? shifts : [] };
    if (!isRealLocalDate(date) || !validateScheduleDays([
      day,
      ...Array.from({ length: 6 }, (_, index) => ({ dayOfWeek: index + 2, enabled: false, shifts: [] as Shift[] })),
    ]) || note.trim().length > 300) {
      setInvalid(true); return;
    }
    onSubmit({ type: "set", date, enabled, shifts: enabled ? [...shifts].sort((a, b) => a.start.localeCompare(b.start)) : [], note: note.trim() });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent closeLabel={copy.cancel}>
        <DialogTitle>{value ? copy.edit : copy.addOverride}</DialogTitle>
        <DialogDescription className="mt-2">{mode === "clinic" ? copy.closures : copy.exceptions}</DialogDescription>
        {invalid && <Alert variant="destructive" className="mt-4"><AlertDescription>{copy.invalidShift}</AlertDescription></Alert>}
        <form onSubmit={submit} className="mt-5 space-y-5" noValidate>
          <label className={labelClass}>{copy.date}<input className={fieldClass} type="date" value={date} onChange={(event) => { setDate(event.target.value); setInvalid(false); }} disabled={pending || Boolean(value)} required /></label>
          <label className="flex min-h-11 items-center gap-3 text-sm font-medium"><input className="size-4" type="checkbox" checked={enabled} onChange={(event) => { setEnabled(event.target.checked); setShifts(event.target.checked && shifts.length === 0 ? [{ start: "09:00", end: "18:00" }] : shifts); }} disabled={pending} />{enabled ? copy.alteredHours : mode === "clinic" ? copy.closed : copy.dayOff}</label>
          {enabled && <div className="space-y-3 rounded-xl border p-4">{shifts.map((shift, index) => <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2"><label className="text-xs font-medium">{copy.start}<input className={fieldClass} type="time" value={shift.start} onChange={(event) => setShifts(shifts.map((item, itemIndex) => itemIndex === index ? { ...item, start: event.target.value } : item))} disabled={pending} /></label><label className="text-xs font-medium">{copy.end}<input className={fieldClass} type="time" value={shift.end} onChange={(event) => setShifts(shifts.map((item, itemIndex) => itemIndex === index ? { ...item, end: event.target.value } : item))} disabled={pending} /></label><Button type="button" size="icon-sm" variant="ghost" onClick={() => setShifts(shifts.filter((_item, itemIndex) => itemIndex !== index))} disabled={pending}><Trash2 aria-hidden="true" /><span className="sr-only">{copy.removeShift}</span></Button></div>)}<Button type="button" size="sm" variant="outline" disabled={pending || shifts.length >= 6} onClick={() => setShifts([...shifts, { start: "09:00", end: "18:00" }])}><Plus aria-hidden="true" />{copy.addShift}</Button></div>}
          <label className={labelClass}>{copy.note}<textarea className={fieldClass} rows={3} maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} disabled={pending} /></label>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>{copy.cancel}</Button><Button type="submit" disabled={pending}>{pending ? copy.saving : copy.save}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OverridePanel({ mode, items, revision, from, to, disabled, onRange, perform, refresh, feedback }: {
  mode: "dentist" | "clinic";
  items: OverrideItem[];
  revision: number;
  from: string;
  to: string;
  disabled?: boolean;
  onRange: (from: string, to: string) => Promise<void>;
  perform: (operation: OverrideOperation, acknowledgement?: string) => Promise<void>;
  refresh: () => Promise<void>;
  feedback: (value: ManagementFeedbackValue) => void;
}) {
  const copy = useManagementCopy();
  const [editor, setEditor] = useState<{ open: boolean; value: OverrideItem | null }>({ open: false, value: null });
  const [removeTarget, setRemoveTarget] = useState<OverrideItem | null>(null);
  const [pending, setPending] = useState(false);
  const [impact, setImpact] = useState<FrozenImpact<OverrideOperation> | null>(null);
  const [range, setRange] = useState({ from, to });

  async function attempt(operation: OverrideOperation, acknowledgement?: string) {
    if (pending || disabled) return;
    setPending(true);
    try {
      await perform(operation, acknowledgement);
      setImpact(null); setEditor({ open: false, value: null }); setRemoveTarget(null);
      await refresh();
      feedback({ kind: "success", message: copy.scheduleSaved });
    } catch (error) {
      const nextImpact = error instanceof StaffApiError ? impactFromError(error, operation) : null;
      if (nextImpact) setImpact(nextImpact);
      else {
        setImpact(null);
        if (error instanceof StaffApiError && (error.code === "SCHEDULE_REVISION_CONFLICT" || error.kind === "network" || error.kind === "timeout")) await refresh().catch(() => undefined);
        feedback(managementFeedback(error, copy));
      }
    } finally { setPending(false); }
  }

  return (
    <section className="rounded-xl border bg-muted/20 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">{mode === "clinic" ? copy.closures : copy.exceptions}</h2><p className="mt-1 text-xs text-muted-foreground">{copy.scheduleRevision}: {revision}</p></div><Button onClick={() => setEditor({ open: true, value: null })} disabled={disabled || pending}><Plus aria-hidden="true" />{copy.addOverride}</Button></div>
      <form className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={(event) => { event.preventDefault(); if (isRealLocalDate(range.from) && isRealLocalDate(range.to) && range.from <= range.to) void onRange(range.from, range.to); }}>
        <label className={labelClass}>{copy.fromDate}<input className={fieldClass} type="date" value={range.from} onChange={(event) => setRange({ ...range, from: event.target.value })} required /></label>
        <label className={labelClass}>{copy.toDate}<input className={fieldClass} type="date" value={range.to} onChange={(event) => setRange({ ...range, to: event.target.value })} required /></label>
        <Button type="submit" variant="outline" disabled={disabled || pending}><RefreshCw aria-hidden="true" />{copy.refresh}</Button>
      </form>
      {disabled ? <p className="mt-5 text-sm text-muted-foreground">{copy.selectDentist}</p> : items.length === 0 ? <p className="mt-5 rounded-lg bg-card p-4 text-sm text-muted-foreground">{copy.noOverrides}</p> : <div className="mt-5 space-y-3">{items.map((item) => {
        const enabled = "isWorking" in item ? item.isWorking : item.isOpen;
        return <article key={item._id} className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{item.date}</p><p className="mt-1 text-sm text-muted-foreground">{enabled ? `${copy.alteredHours}: ${item.shifts.map((shift) => `${shift.start}–${shift.end}`).join(", ")}` : mode === "clinic" ? copy.closed : copy.dayOff}</p>{item.note && <p className="mt-1 text-sm text-muted-foreground">{item.note}</p>}</div><div className="flex gap-2"><Button type="button" variant="outline" size="sm" onClick={() => setEditor({ open: true, value: item })}><Pencil aria-hidden="true" />{copy.edit}</Button><Button type="button" variant="destructive" size="sm" onClick={() => setRemoveTarget(item)}><Trash2 aria-hidden="true" />{copy.deleteOverride}</Button></div></article>;
      })}</div>}
      {editor.open && <OverrideEditor mode={mode} value={editor.value} open pending={pending} onOpenChange={(open) => setEditor((current) => ({ ...current, open }))} onSubmit={(operation) => void attempt({ ...operation, revision })} />}
      <ConfirmActionDialog open={Boolean(removeTarget)} onOpenChange={(open) => !open && setRemoveTarget(null)} title={copy.removeOverrideTitle} body={copy.removeOverrideBody} pending={pending} confirmLabel={copy.confirmRemove} onConfirm={() => removeTarget && void attempt({ type: "delete", date: removeTarget.date, revision })} />
      {impact && <ScheduleImpactDialog open conflicts={impact.conflicts} conflictCount={impact.count} truncated={impact.truncated} pending={pending} onCancel={() => setImpact(null)} onConfirm={() => void attempt(impact.operation, impact.token)} />}
    </section>
  );
}

function ScheduleAdminContent() {
  const { api, handleApiError } = useStaffAuth();
  const copy = useManagementCopy();
  const [view, setView] = useState<"clinic" | "dentist" | "exceptions" | "closures">("clinic");
  const [clinic, setClinic] = useState<StaffClinic | null>(null);
  const [dentists, setDentists] = useState<StaffDentist[]>([]);
  const [selectedDentistId, setSelectedDentistId] = useState("");
  const [closures, setClosures] = useState<StaffClinicClosure[]>([]);
  const [exceptions, setExceptions] = useState<StaffScheduleException[]>([]);
  const [range, setRange] = useState({ from: "", to: "" });
  const [loading, setLoading] = useState(true);
  const [feedbackValue, setFeedbackValue] = useState<ManagementFeedbackValue | null>(null);
  const selectedDentistIdRef = useRef("");
  const rangeRef = useRef<DateRange>({ from: "", to: "" });
  const loadRequestRef = useRef<RequestFence>({ generation: 0, controller: null });
  const exceptionRequestRef = useRef<RequestFence>({ generation: 0, controller: null });
  const closureRequestRef = useRef<RequestFence>({ generation: 0, controller: null });

  const requestExceptions = useCallback(async (
    dentistId: string,
    requestedRange: DateRange,
    parentSignal?: AbortSignal,
  ) => {
    exceptionRequestRef.current.controller?.abort();
    const generation = exceptionRequestRef.current.generation + 1;
    if (!dentistId || !requestedRange.from || !requestedRange.to) {
      exceptionRequestRef.current = { generation, controller: null };
      setExceptions([]);
      return;
    }

    const controller = new AbortController();
    exceptionRequestRef.current = { generation, controller };
    const signal = parentSignal
      ? AbortSignal.any([parentSignal, controller.signal])
      : controller.signal;
    const isCurrent = () => (
      exceptionRequestRef.current.generation === generation &&
      !signal.aborted &&
      selectedDentistIdRef.current === dentistId &&
      sameRange(rangeRef.current, requestedRange)
    );

    try {
      const nextExceptions = await api.listScheduleExceptions(
        dentistId,
        requestedRange.from,
        requestedRange.to,
        signal,
      );
      if (!isCurrent()) return;
      if (nextExceptions.some((item) => (
        item.dentist !== dentistId ||
        item.date < requestedRange.from ||
        item.date > requestedRange.to
      ))) {
        throw new StaffApiError({ kind: "protocol" });
      }
      setExceptions(nextExceptions);
    } catch (error) {
      if (!isCurrent() || (error instanceof StaffApiError && error.kind === "cancelled")) return;
      handleApiError(error);
      setFeedbackValue(managementFeedback(error, copy));
    }
  }, [api, copy, handleApiError]);

  const requestClosures = useCallback(async (
    requestedRange: DateRange,
    parentSignal?: AbortSignal,
  ) => {
    closureRequestRef.current.controller?.abort();
    const generation = closureRequestRef.current.generation + 1;
    if (!requestedRange.from || !requestedRange.to) {
      closureRequestRef.current = { generation, controller: null };
      setClosures([]);
      return;
    }

    const controller = new AbortController();
    closureRequestRef.current = { generation, controller };
    const signal = parentSignal
      ? AbortSignal.any([parentSignal, controller.signal])
      : controller.signal;
    const isCurrent = () => (
      closureRequestRef.current.generation === generation &&
      !signal.aborted &&
      sameRange(rangeRef.current, requestedRange)
    );

    try {
      const nextClosures = await api.listClinicClosures(
        requestedRange.from,
        requestedRange.to,
        signal,
      );
      if (!isCurrent()) return;
      if (nextClosures.some((item) => item.date < requestedRange.from || item.date > requestedRange.to)) {
        throw new StaffApiError({ kind: "protocol" });
      }
      setClosures(nextClosures);
    } catch (error) {
      if (!isCurrent() || (error instanceof StaffApiError && error.kind === "cancelled")) return;
      handleApiError(error);
      setFeedbackValue(managementFeedback(error, copy));
    }
  }, [api, copy, handleApiError]);

  const load = useCallback(async (parentSignal?: AbortSignal) => {
    loadRequestRef.current.controller?.abort();
    const generation = loadRequestRef.current.generation + 1;
    const controller = new AbortController();
    loadRequestRef.current = { generation, controller };
    const signal = parentSignal
      ? AbortSignal.any([parentSignal, controller.signal])
      : controller.signal;
    const isCurrent = () => loadRequestRef.current.generation === generation && !signal.aborted;
    setLoading(true);
    try {
      const [nextClinic, nextDentists] = await Promise.all([api.getClinic(signal), api.listDentists(signal)]);
      if (!isCurrent()) return;
      setClinic(nextClinic);
      setDentists(nextDentists);

      let nextRange = rangeRef.current;
      if (!nextRange.from || !nextRange.to) {
        const from = clinicLocalDate(nextClinic.timezone);
        nextRange = { from, to: addCalendarDays(from, 90) };
        rangeRef.current = nextRange;
        setRange(nextRange);
      }
      const dentistId = selectedDentistIdRef.current;
      await Promise.all([
        requestClosures(nextRange, signal),
        requestExceptions(dentistId, nextRange, signal),
      ]);
    } catch (error) {
      if (!isCurrent() || (error instanceof StaffApiError && error.kind === "cancelled")) return;
      handleApiError(error);
      setFeedbackValue({ ...managementFeedback(error, copy), message: copy.loadError });
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [api, copy, handleApiError, requestClosures, requestExceptions]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) void load(controller.signal); });
    return () => {
      controller.abort();
      loadRequestRef.current.controller?.abort();
      exceptionRequestRef.current.controller?.abort();
      closureRequestRef.current.controller?.abort();
    };
  }, [load]);

  const selectedDentist = dentists.find((dentist) => dentist._id === selectedDentistId) ?? null;
  function changeDentist(id: string) {
    selectedDentistIdRef.current = id;
    setSelectedDentistId(id);
    setExceptions([]);
    void requestExceptions(id, rangeRef.current);
  }
  async function updateRange(from: string, to: string) {
    const nextRange = { from, to };
    rangeRef.current = nextRange;
    setRange(nextRange);
    await Promise.all([
      requestClosures(nextRange),
      requestExceptions(selectedDentistIdRef.current, nextRange),
    ]);
  }

  if (loading && !clinic) return <section><ManagementHeader eyebrow={copy.schedulesNav} title={copy.schedulesTitle} intro={copy.schedulesIntro} /><p role="status" className="mt-8 text-sm text-muted-foreground">{copy.loading}</p></section>;
  if (!clinic) return <section><ManagementHeader eyebrow={copy.schedulesNav} title={copy.schedulesTitle} intro={copy.schedulesIntro} /><ManagementFeedback value={feedbackValue} onRetry={() => void load()} /></section>;
  const tabs = [
    ["clinic", copy.clinicWeekly], ["dentist", copy.dentistWeekly], ["exceptions", copy.exceptions], ["closures", copy.closures],
  ] as const;
  return (
    <section className="max-w-7xl">
      <ManagementHeader eyebrow={copy.schedulesNav} title={copy.schedulesTitle} intro={copy.schedulesIntro} />
      <div className="mt-5 flex flex-wrap gap-2 text-sm"><span className="rounded-full bg-secondary px-3 py-1.5">{copy.timezone}: {clinic.timezone}</span></div>
      <ManagementFeedback value={feedbackValue} onRetry={() => void load()} />
      <div role="tablist" aria-label={copy.schedulesTitle} className="mt-7 flex flex-wrap gap-2">{tabs.map(([id, label]) => <Button key={id} role="tab" aria-selected={view === id} variant={view === id ? "secondary" : "outline"} onClick={() => setView(id)}>{label}</Button>)}</div>
      {(view === "dentist" || view === "exceptions") && <label className={`${labelClass} mt-6 max-w-xl`}>{copy.selectDentist}<select className={fieldClass} value={selectedDentistId} onChange={(event) => void changeDentist(event.target.value)}><option value="">{copy.selectDentist}</option>{dentists.map((dentist) => <option key={dentist._id} value={dentist._id}>{dentist.firstName} {dentist.lastName}{dentist.isActive ? "" : ` — ${copy.inactive}`}</option>)}</select></label>}
      <div className="mt-6">
        {view === "clinic" && <WeeklyPanel key={`clinic-${clinic.scheduleRevision}`} kind="clinic" schedule={clinic.weeklySchedule} revision={clinic.scheduleRevision} title={copy.clinicWeekly} pendingGlobal={loading} save={(schedule, revision, acknowledgement) => api.updateClinic({ weeklySchedule: schedule as ClinicWorkingDay[], expectedScheduleRevision: revision, ...(acknowledgement ? { scheduleConflictAcknowledgement: acknowledgement } : {}) }).then(() => undefined)} refresh={load} feedback={setFeedbackValue} />}
        {view === "dentist" && (selectedDentist ? <WeeklyPanel key={`dentist-${selectedDentist._id}-${selectedDentist.scheduleRevision}`} kind="dentist" schedule={selectedDentist.weeklySchedule} revision={selectedDentist.scheduleRevision} title={`${copy.dentistWeekly} · ${selectedDentist.firstName} ${selectedDentist.lastName}`} pendingGlobal={loading} save={(schedule, revision, acknowledgement) => api.updateDentist(selectedDentist._id, { weeklySchedule: schedule as DentistWorkingDay[], expectedScheduleRevision: revision, ...(acknowledgement ? { scheduleConflictAcknowledgement: acknowledgement } : {}) }).then(() => undefined)} refresh={load} feedback={setFeedbackValue} /> : <p className="rounded-xl border bg-card p-5 text-muted-foreground">{copy.selectDentist}</p>)}
        {view === "exceptions" && <OverridePanel key={`exceptions-${selectedDentist?._id ?? "none"}`} mode="dentist" items={exceptions} revision={selectedDentist?.scheduleRevision ?? 0} from={range.from} to={range.to} disabled={!selectedDentist} onRange={updateRange} perform={async (operation, acknowledgement) => {
          if (!selectedDentist) return;
          if (operation.type === "set") await api.setScheduleException(selectedDentist._id, operation.date, { expectedScheduleRevision: operation.revision, isWorking: operation.enabled, shifts: operation.shifts, note: operation.note, ...(acknowledgement ? { scheduleConflictAcknowledgement: acknowledgement } : {}) } as ScheduleExceptionPayload);
          else await api.deleteScheduleException(selectedDentist._id, operation.date, operation.revision, acknowledgement);
        }} refresh={load} feedback={setFeedbackValue} />}
        {view === "closures" && <OverridePanel mode="clinic" items={closures} revision={clinic.scheduleRevision} from={range.from} to={range.to} onRange={updateRange} perform={async (operation, acknowledgement) => {
          if (operation.type === "set") await api.setClinicClosure(operation.date, { expectedScheduleRevision: operation.revision, isOpen: operation.enabled, shifts: operation.shifts, note: operation.note, ...(acknowledgement ? { scheduleConflictAcknowledgement: acknowledgement } : {}) } as ClinicClosurePayload);
          else await api.deleteClinicClosure(operation.date, operation.revision, acknowledgement);
        }} refresh={load} feedback={setFeedbackValue} />}
      </div>
    </section>
  );
}

export function StaffScheduleManagement() {
  const { user } = useStaffAuth();
  if (user?.role !== "admin") return <StaffAccessDenied />;
  return <ScheduleAdminContent />;
}
