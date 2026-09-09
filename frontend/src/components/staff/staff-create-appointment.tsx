"use client";

import { useMemo, useRef, useState } from "react";
import type { StaffAppointment } from "@/api/staff-client";
import { staffErrorMessage } from "@/components/staff/staff-feedback";
import { useStaffAuth } from "@/components/staff/staff-auth-provider";
import type { StaffCatalog } from "@/components/staff/staff-appointment-types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { bookingDateRange } from "@/lib/booking-date";

const fieldClass = "mt-2 min-h-11 w-full rounded-md border bg-background px-3 py-2 text-base shadow-sm";

export function CreateAppointmentDialog({ catalog, onCreated }: { catalog: StaffCatalog; onCreated(appointment: StaffAppointment): void }) {
  const { locale, copy, api, handleApiError } = useStaffAuth();
  const [open, setOpen] = useState(false);
  const [serviceId, setServiceId] = useState("");
  const [dentistId, setDentistId] = useState("");
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState("");
  const [slots, setSlots] = useState<Array<{ start: string; end: string }>>([]);
  const [availabilityLoaded, setAvailabilityLoaded] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const availabilityAbort = useRef<AbortController | null>(null);
  const dateRange = bookingDateRange({
    timezone: catalog.clinic.timezone,
    allowSameDay: catalog.clinic.allowSameDayBooking,
    maxDaysAhead: catalog.clinic.maxBookingDaysAhead,
  });
  const dentists = useMemo(() => catalog.dentists.filter((item) => !serviceId || item.serviceIds.includes(serviceId)), [catalog.dentists, serviceId]);

  function invalidateAvailability() {
    generation.current += 1;
    availabilityAbort.current?.abort();
    setSlot("");
    setSlots([]);
    setAvailabilityLoaded(false);
    setLoadingSlots(false);
  }

  function resetSchedulingState() {
    setServiceId("");
    setDentistId("");
    setDate("");
    setError(null);
    invalidateAvailability();
  }

  async function loadAvailability(): Promise<boolean> {
    if (!serviceId || !dentistId || !date || loadingSlots) return false;
    invalidateAvailability();
    const requestGeneration = generation.current;
    const controller = new AbortController();
    availabilityAbort.current = controller;
    setLoadingSlots(true);
    setError(null);
    try {
      const result = await api.getAvailability({ serviceId, dentistId, date, signal: controller.signal });
      if (requestGeneration !== generation.current) return false;
      setSlots(result.slots.map(({ start, end }) => ({ start, end })));
      setAvailabilityLoaded(true);
      return true;
    } catch (caught) {
      if (controller.signal.aborted) return false;
      handleApiError(caught);
      setError(staffErrorMessage(caught, copy));
      return false;
    } finally {
      if (requestGeneration === generation.current) setLoadingSlots(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !slot) return;
    const data = new FormData(event.currentTarget);
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.createAppointment({
        patientName: String(data.get("patientName") || "").trim(),
        patientPhone: String(data.get("patientPhone") || "").trim(),
        patientEmail: String(data.get("patientEmail") || "").trim().toLowerCase(),
        patientComment: String(data.get("patientComment") || "").trim(),
        internalNote: String(data.get("internalNote") || "").trim(),
        dentistId, serviceId, date, startTime: slot, locale,
        privacyAccepted: true,
        consentMethod: String(data.get("consentMethod")) as "phone" | "in_person",
        source: "phone",
      });
      resetSchedulingState();
      onCreated(created);
      setOpen(false);
    } catch (caught) {
      handleApiError(caught);
      if (caught && typeof caught === "object" && "status" in caught && caught.status === 409) {
        setSlot("");
        if (await loadAvailability()) setError(copy.slotConflict);
      } else {
        setError(staffErrorMessage(caught, copy));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) availabilityAbort.current?.abort(); }}>
      <DialogTrigger render={<Button />}><span>{copy.newAppointment}</span></DialogTrigger>
      <DialogContent closeLabel={copy.close}>
        <DialogTitle>{copy.createTitle}</DialogTitle>
        <DialogDescription>{copy.appointmentsIntro}</DialogDescription>
        <form className="mt-6 space-y-5" onSubmit={submit}>
          {error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">{copy.patientName}<input className={fieldClass} name="patientName" required minLength={2} maxLength={120} disabled={submitting} /></label>
            <label className="text-sm font-medium">{copy.patientPhone}<input className={fieldClass} name="patientPhone" type="tel" autoComplete="tel" required minLength={8} maxLength={30} disabled={submitting} /></label>
            <label className="text-sm font-medium sm:col-span-2">{copy.patientEmailOptional}<input className={fieldClass} name="patientEmail" type="email" autoComplete="email" required={catalog.clinic.requireEmail} maxLength={254} disabled={submitting} /></label>
            <label className="text-sm font-medium">{copy.service}<select className={fieldClass} value={serviceId} required disabled={submitting} onChange={(event) => { setServiceId(event.target.value); setDentistId(""); setDate(""); invalidateAvailability(); }}><option value="">{copy.chooseService}</option>{catalog.services.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="text-sm font-medium">{copy.dentist}<select className={fieldClass} value={dentistId} required disabled={!serviceId || submitting} onChange={(event) => { setDentistId(event.target.value); setDate(""); invalidateAvailability(); }}><option value="">{copy.chooseDentist}</option>{dentists.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="text-sm font-medium">{copy.date}<input className={fieldClass} value={date} onChange={(event) => { setDate(event.target.value); invalidateAvailability(); }} type="date" min={dateRange.min} max={dateRange.max} required disabled={!dentistId || submitting} /></label>
            <div className="flex items-end"><Button type="button" variant="outline" className="w-full" onClick={() => void loadAvailability()} disabled={!date || loadingSlots || submitting}>{loadingSlots ? copy.loadingAvailability : copy.loadAvailability}</Button></div>
          </div>
          {slots.length > 0 && <fieldset><legend className="text-sm font-semibold">{copy.availableTimes}</legend><div className="mt-3 flex flex-wrap gap-2">{slots.map((item) => <Button key={item.start} type="button" variant={slot === item.start ? "default" : "outline"} aria-pressed={slot === item.start} onClick={() => setSlot(item.start)}>{item.start}–{item.end}<span className="sr-only"> {copy.chooseTime.replace("{time}", item.start)}</span></Button>)}</div></fieldset>}
          {!loadingSlots && availabilityLoaded && slots.length === 0 && !error && <p className="text-sm text-muted-foreground">{copy.noAvailability}</p>}
          <label className="block text-sm font-medium">{copy.patientCommentOptional}<textarea className={fieldClass} name="patientComment" maxLength={1000} rows={3} disabled={submitting} /></label>
          <label className="block text-sm font-medium">{copy.internalNoteOptional}<textarea className={fieldClass} name="internalNote" maxLength={2000} rows={3} disabled={submitting} /></label>
          <label className="block text-sm font-medium">{copy.consentMethod}<select className={fieldClass} name="consentMethod" defaultValue="phone" disabled={submitting}><option value="phone">{copy.consentPhone}</option><option value="in_person">{copy.consentInPerson}</option></select></label>
          <label className="flex items-start gap-3 text-sm leading-6"><input className="mt-1 size-5" type="checkbox" required disabled={submitting} />{copy.privacyAccepted}</label>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><DialogClose render={<Button type="button" variant="outline" disabled={submitting} />}><span>{copy.close}</span></DialogClose><Button type="submit" disabled={submitting || !slot}>{submitting ? copy.creatingAppointment : copy.createAppointment}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
