"use client";

import Link from "next/link";
import type { Route } from "next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StaffApiError, type StaffAppointment, type StaffAppointmentStatus } from "@/api/staff-client";
import {
  cancellable, formatClinicDate, formatClinicTimestamp, referenceId, reschedulable,
  statusClass, statusLabel, transitions,
} from "@/components/staff/staff-appointment-helpers";
import type { StaffCatalog } from "@/components/staff/staff-appointment-types";
import { staffErrorMessage } from "@/components/staff/staff-feedback";
import { useStaffAuth } from "@/components/staff/staff-auth-provider";
import { StaffAccessDenied } from "@/components/staff/staff-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { bookingDateRange } from "@/lib/booking-date";

const fieldClass = "mt-2 min-h-11 w-full rounded-md border bg-background px-3 py-2 text-base shadow-sm";

export function StaffAppointmentDetail({ appointmentId, catalog }: { appointmentId: string; catalog: StaffCatalog }) {
  const { locale, copy, user, api, handleApiError } = useStaffAuth();
  const [appointment, setAppointment] = useState<StaffAppointment | null>(null);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [serviceId, setServiceId] = useState("");
  const [dentistId, setDentistId] = useState("");
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [slot, setSlot] = useState("");
  const [slots, setSlots] = useState<Array<{ start: string; end: string }>>([]);
  const [availabilityLoaded, setAvailabilityLoaded] = useState(false);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const availabilityGeneration = useRef(0);
  const availabilityAbort = useRef<AbortController | null>(null);
  const dateRange = bookingDateRange({ timezone: catalog.clinic.timezone, allowSameDay: catalog.clinic.allowSameDayBooking, maxDaysAhead: catalog.clinic.maxBookingDaysAhead });

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!user || user.role === "dentist" || signal?.aborted) return;
    setLoading(true);
    setError(null);
    try {
      const current = await api.getAppointment(appointmentId, signal);
      setAppointment(current);
      setServiceId(referenceId(current.service));
      setDentistId(referenceId(current.dentist));
      setDate(current.date);
      setSlot("");
      setSlots([]);
      setAvailabilityLoaded(false);
    } catch (caught) {
      if (signal?.aborted) return;
      handleApiError(caught);
      setError(staffErrorMessage(caught, copy));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [api, appointmentId, copy, handleApiError, user]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) void load(controller.signal); });
    return () => controller.abort();
  }, [load]);

  const dentistOptions = useMemo(() => catalog.dentists.filter((item) => !serviceId || item.serviceIds.includes(serviceId)), [catalog.dentists, serviceId]);

  function invalidateAvailability() {
    availabilityGeneration.current += 1;
    availabilityAbort.current?.abort();
    setSlot("");
    setSlots([]);
    setAvailabilityLoaded(false);
    setLoadingAvailability(false);
  }

  async function staleConflict(caught: unknown, scheduling = false) {
    if (caught instanceof StaffApiError && caught.status === 409) {
      setNotice(caught.code === "APPOINTMENT_VERSION_CONFLICT" ? copy.changedConflict : scheduling ? copy.slotConflict : copy.changedConflict);
      invalidateAvailability();
      await load();
      return true;
    }
    return false;
  }

  async function updateStatus(status: StaffAppointmentStatus) {
    if (!appointment || mutating) return;
    setMutating(true);
    setNotice(null);
    setError(null);
    try {
      await api.updateStatus(appointment._id, appointment.mutationVersion, status as Exclude<StaffAppointmentStatus, "pending" | "cancelled">);
      await load();
    } catch (caught) {
      setCancelOpen(false);
      handleApiError(caught);
      if (!(await staleConflict(caught))) setError(staffErrorMessage(caught, copy));
    } finally {
      setMutating(false);
    }
  }

  async function cancel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!appointment || mutating) return;
    const cancellationReason = String(new FormData(event.currentTarget).get("reason") || "").trim();
    setMutating(true);
    setNotice(null);
    setError(null);
    try {
      await api.cancelAppointment(appointment._id, appointment.mutationVersion, cancellationReason);
      setCancelOpen(false);
      await load();
    } catch (caught) {
      handleApiError(caught);
      if (!(await staleConflict(caught))) setError(staffErrorMessage(caught, copy));
    } finally {
      setMutating(false);
    }
  }

  async function loadAvailability() {
    if (!appointment || !serviceId || !dentistId || !date || loadingAvailability) return;
    invalidateAvailability();
    const currentGeneration = availabilityGeneration.current;
    const controller = new AbortController();
    availabilityAbort.current = controller;
    setLoadingAvailability(true);
    setError(null);
    try {
      const result = await api.getRescheduleAvailability({
        id: appointment._id, expectedMutationVersion: appointment.mutationVersion,
        serviceId, dentistId, date, signal: controller.signal,
      });
      if (currentGeneration !== availabilityGeneration.current) return;
      setSlots(result.slots.map(({ start, end }) => ({ start, end })));
      setAvailabilityLoaded(true);
    } catch (caught) {
      if (controller.signal.aborted) return;
      handleApiError(caught);
      if (!(await staleConflict(caught, true))) setError(staffErrorMessage(caught, copy));
    } finally {
      if (currentGeneration === availabilityGeneration.current) setLoadingAvailability(false);
    }
  }

  async function reschedule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!appointment || !slot || mutating) return;
    setMutating(true);
    setNotice(null);
    setError(null);
    try {
      await api.rescheduleAppointment(appointment._id, {
        expectedMutationVersion: appointment.mutationVersion,
        serviceId, dentistId, date, startTime: slot, reason: reason.trim(),
      });
      setReason("");
      await load();
    } catch (caught) {
      handleApiError(caught);
      if (!(await staleConflict(caught, true))) setError(staffErrorMessage(caught, copy));
    } finally {
      setMutating(false);
    }
  }

  if (user?.role === "dentist") return <StaffAccessDenied />;
  if (loading && !appointment) return <p role="status" className="text-sm text-muted-foreground">{copy.loadingAppointments}</p>;
  if (!appointment) return <Alert variant="destructive" role="alert"><AlertDescription>{error || copy.detailError}</AlertDescription><Button className="mt-4" variant="outline" onClick={() => void load()}>{copy.refresh}</Button></Alert>;

  const availableTransitions = transitions[appointment.status];
  const currentServiceId = referenceId(appointment.service);
  const currentDentistId = referenceId(appointment.dentist);
  const knownServices = catalog.services.some((item) => item.id === currentServiceId) ? catalog.services : [{ id: currentServiceId, name: appointment.serviceSnapshot.name, durationMinutes: appointment.serviceSnapshot.durationMinutes }, ...catalog.services];
  const knownDentists = dentistOptions.some((item) => item.id === currentDentistId) || serviceId !== currentServiceId ? dentistOptions : [{ id: currentDentistId, name: `${appointment.dentistSnapshot.firstName} ${appointment.dentistSnapshot.lastName}`, serviceIds: [serviceId] }, ...dentistOptions];

  return (
    <section className="max-w-6xl">
      <Link href={`/${locale}/staff/appointments` as Route} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline">← {copy.backToAppointments}</Link>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-bold tracking-[0.14em] text-primary uppercase">{appointment.confirmationCode}</p><h1 className="display-type mt-3 text-4xl sm:text-5xl">{copy.appointmentDetail}</h1><p className="mt-3 text-lg font-semibold">{appointment.patientName}</p></div><span className={`w-fit rounded-full px-3 py-1.5 text-sm font-semibold ${statusClass(appointment.status)}`}>{statusLabel(appointment.status, copy)}</span></div>
      {notice && <Alert className="mt-6" role="status"><AlertDescription>{notice}</AlertDescription></Alert>}
      {error && <Alert variant="destructive" className="mt-6" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="mt-7 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="rounded-xl border bg-card p-5 sm:p-7">
          <h2 className="text-lg font-semibold">{copy.appointmentDetail}</h2>
          <dl className="mt-5 grid gap-x-6 gap-y-5 sm:grid-cols-2">
            <div><dt className="text-xs font-semibold text-muted-foreground">{copy.date}</dt><dd className="mt-1">{formatClinicDate(appointment.date, locale)}</dd></div>
            <div><dt className="text-xs font-semibold text-muted-foreground">{copy.time} · {catalog.clinic.timezone}</dt><dd className="mt-1">{appointment.startTime}–{appointment.endTime}</dd></div>
            <div><dt className="text-xs font-semibold text-muted-foreground">{copy.service}</dt><dd className="mt-1">{appointment.serviceSnapshot.name}</dd></div>
            <div><dt className="text-xs font-semibold text-muted-foreground">{copy.dentist}</dt><dd className="mt-1">{appointment.dentistSnapshot.firstName} {appointment.dentistSnapshot.lastName}</dd></div>
            <div><dt className="text-xs font-semibold text-muted-foreground">{copy.phone}</dt><dd className="mt-1"><a href={`tel:${appointment.patientPhone.replace(/[^+\d]/g, "")}`} className="underline-offset-4 hover:underline">{appointment.patientPhone}</a></dd></div>
            <div><dt className="text-xs font-semibold text-muted-foreground">{copy.patientEmail}</dt><dd className="mt-1 break-all">{appointment.patientEmail || copy.noEmail}</dd></div>
            <div><dt className="text-xs font-semibold text-muted-foreground">{copy.source}</dt><dd className="mt-1">{appointment.source}</dd></div>
            <div><dt className="text-xs font-semibold text-muted-foreground">{copy.created}</dt><dd className="mt-1">{formatClinicTimestamp(appointment.createdAt, locale, catalog.clinic.timezone)}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs font-semibold text-muted-foreground">{copy.patientComment}</dt><dd className="mt-1 whitespace-pre-wrap">{appointment.patientComment || copy.noComment}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs font-semibold text-muted-foreground">{copy.internalNote}</dt><dd className="mt-1 whitespace-pre-wrap">{appointment.internalNote || copy.noComment}</dd></div>
          </dl>
        </div>
        <aside className="rounded-xl border bg-card p-5 sm:p-7">
          <h2 className="text-lg font-semibold">{copy.actions}</h2>
          <div className="mt-5 flex flex-col gap-3">{availableTransitions.map((nextStatus) => <Button key={nextStatus} variant="outline" disabled={mutating} onClick={() => void updateStatus(nextStatus)}>{copy.transitionTo.replace("{status}", statusLabel(nextStatus, copy))}</Button>)}</div>
          {cancellable.has(appointment.status) && <Dialog open={cancelOpen} onOpenChange={setCancelOpen}><DialogTrigger render={<Button className="mt-3 w-full" variant="destructive" disabled={mutating} />}><span>{copy.cancel}</span></DialogTrigger><DialogContent closeLabel={copy.close} className="max-w-lg"><DialogTitle>{copy.cancelTitle}</DialogTitle><DialogDescription>{copy.cancelBody}</DialogDescription><form className="mt-6 space-y-5" onSubmit={cancel}><label className="block text-sm font-medium">{copy.cancellationReason}<textarea className={fieldClass} name="reason" minLength={2} maxLength={500} rows={4} required disabled={mutating} /></label><div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><DialogClose render={<Button type="button" variant="outline" disabled={mutating} />}><span>{copy.keepAppointment}</span></DialogClose><Button type="submit" variant="destructive" disabled={mutating}>{mutating ? copy.updating : copy.confirmCancellation}</Button></div></form></DialogContent></Dialog>}
        </aside>
      </div>
      {reschedulable.has(appointment.status) && (
        <form className="mt-6 rounded-xl border bg-card p-5 sm:p-7" onSubmit={reschedule}>
          <h2 className="text-lg font-semibold">{copy.rescheduleTitle}</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm font-medium">{copy.service}<select className={fieldClass} value={serviceId} disabled={mutating} onChange={(event) => { setServiceId(event.target.value); setDentistId(""); invalidateAvailability(); }} required>{knownServices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="text-sm font-medium">{copy.dentist}<select className={fieldClass} value={dentistId} disabled={mutating || !serviceId} onChange={(event) => { setDentistId(event.target.value); invalidateAvailability(); }} required><option value="">{copy.chooseDentist}</option>{knownDentists.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="text-sm font-medium">{copy.date}<input className={fieldClass} type="date" min={dateRange.min} max={dateRange.max} value={date} disabled={mutating} onChange={(event) => { setDate(event.target.value); invalidateAvailability(); }} required /></label>
            <div className="flex items-end"><Button className="w-full" type="button" variant="outline" disabled={!serviceId || !dentistId || !date || loadingAvailability || mutating} onClick={() => void loadAvailability()}>{loadingAvailability ? copy.loadingAvailability : copy.loadAvailability}</Button></div>
          </div>
          {slots.length > 0 && <fieldset className="mt-5"><legend className="text-sm font-semibold">{copy.availableTimes}</legend><div className="mt-3 flex flex-wrap gap-2">{slots.map((item) => <Button key={item.start} type="button" variant={slot === item.start ? "default" : "outline"} aria-pressed={slot === item.start} onClick={() => setSlot(item.start)}>{item.start}–{item.end}</Button>)}</div></fieldset>}
          {availabilityLoaded && slots.length === 0 && <p className="mt-4 text-sm text-muted-foreground">{copy.noAvailability}</p>}
          <label className="mt-5 block max-w-xl text-sm font-medium">{copy.reason}<textarea className={fieldClass} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={3} disabled={mutating} /></label>
          <Button className="mt-5" type="submit" disabled={!slot || mutating}>{mutating ? copy.updating : copy.confirmReschedule}</Button>
        </form>
      )}
    </section>
  );
}
