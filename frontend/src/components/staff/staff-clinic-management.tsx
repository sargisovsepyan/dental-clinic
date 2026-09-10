"use client";

import { Save } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { StaffApiError } from "@/api/staff-client";
import type { StaffClinic, UpdateClinicPayload } from "@/api/staff-management";
import { useStaffAuth } from "@/components/staff/staff-auth-provider";
import { StaffAccessDenied } from "@/components/staff/staff-shell";
import {
  compactTranslations,
  fieldClass,
  labelClass,
  LocalizedFields,
  localizedDraft,
  ManagementFeedback,
  ManagementHeader,
  managementFeedback,
  useManagementCopy,
  type LocalizedDraft,
  type ManagementFeedbackValue,
} from "@/components/staff/staff-management-shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { safeExternalUrl, safeSocialUrl } from "@/lib/safe-urls";

function nullableNumber(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function ClinicSettingsForm({ clinic, onSaved }: {
  clinic: StaffClinic;
  onSaved: (clinic: StaffClinic) => void;
}) {
  const { api, handleApiError } = useStaffAuth();
  const copy = useManagementCopy();
  const [translations, setTranslations] = useState<LocalizedDraft>(() => localizedDraft(clinic.translations, ["clinicName", "tagline", "description", "address"]));
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<ManagementFeedbackValue | null>(null);
  const [validation, setValidation] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    const mapUrl = String(data.get("mapUrl") || "").trim();
    const socialLinks = {
      instagram: String(data.get("instagram") || "").trim(),
      facebook: String(data.get("facebook") || "").trim(),
      whatsapp: String(data.get("whatsapp") || "").trim(),
      telegram: String(data.get("telegram") || "").trim(),
    };
    const latitude = nullableNumber(data.get("latitude"));
    const longitude = nullableNumber(data.get("longitude"));
    const email = String(data.get("email") || "").trim().toLowerCase();
    const slotIntervalMinutes = Number(data.get("slotIntervalMinutes"));
    const minBookingNoticeMinutes = Number(data.get("minBookingNoticeMinutes"));
    const maxBookingDaysAhead = Number(data.get("maxBookingDaysAhead"));
    const bufferMinutes = Number(data.get("bufferMinutes"));
    const maxAppointmentsPerPhonePerDay = Number(data.get("maxAppointmentsPerPhonePerDay"));
    const urlsValid = (!mapUrl || Boolean(safeExternalUrl(mapUrl))) &&
      (Object.entries(socialLinks) as Array<[keyof typeof socialLinks, string]>).every(([platform, url]) => !url || Boolean(safeSocialUrl(platform, url)));
    const numericValid = (latitude === null || (latitude >= -90 && latitude <= 90)) &&
      (longitude === null || (longitude >= -180 && longitude <= 180)) &&
      [10, 15, 20, 30, 60].includes(slotIntervalMinutes) &&
      Number.isInteger(minBookingNoticeMinutes) && minBookingNoticeMinutes >= 0 && minBookingNoticeMinutes <= 10_080 &&
      Number.isInteger(maxBookingDaysAhead) && maxBookingDaysAhead >= 1 && maxBookingDaysAhead <= 365 &&
      Number.isInteger(bufferMinutes) && bufferMinutes >= 0 && bufferMinutes <= 120 &&
      Number.isInteger(maxAppointmentsPerPhonePerDay) && maxAppointmentsPerPhonePerDay >= 1 && maxAppointmentsPerPhonePerDay <= 20;
    if (translations.hy.clinicName.trim().length < 2 || !urlsValid || !numericValid ||
        (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      setValidation(urlsValid ? copy.validationError : copy.unsafeUrl);
      return;
    }

    const payload: UpdateClinicPayload = {
      translations: compactTranslations(translations) as UpdateClinicPayload["translations"],
      phone: String(data.get("phone") || "").trim(),
      secondaryPhone: String(data.get("secondaryPhone") || "").trim(),
      email,
      mapUrl,
      latitude,
      longitude,
      socialLinks,
      bookingSettings: {
        isBookingEnabled: data.get("isBookingEnabled") === "on",
        slotIntervalMinutes: slotIntervalMinutes as 10 | 15 | 20 | 30 | 60,
        minBookingNoticeMinutes,
        maxBookingDaysAhead,
        bufferMinutes,
        allowSameDayBooking: data.get("allowSameDayBooking") === "on",
        requireEmail: data.get("requireEmail") === "on",
        autoConfirmAppointments: data.get("autoConfirmAppointments") === "on",
        maxAppointmentsPerPhonePerDay,
      },
    };
    setValidation(null); setFeedback(null); setPending(true);
    try {
      const authoritative = await api.updateClinic(payload);
      onSaved(authoritative);
    } catch (error) {
      handleApiError(error); setFeedback(managementFeedback(error, copy));
    } finally { setPending(false); }
  }

  const booking = clinic.bookingSettings;
  return (
    <form onSubmit={submit} className="mt-7 space-y-6" noValidate>
      {(validation || feedback) && (validation ? <Alert variant="destructive"><AlertDescription>{validation}</AlertDescription></Alert> : <ManagementFeedback value={feedback} />)}
      <section className="rounded-xl border bg-card p-5 shadow-sm"><h2 className="text-xl font-semibold">{copy.clinicContent}</h2><div className="mt-4"><LocalizedFields value={translations} onChange={setTranslations} disabled={pending} primaryRequired={["clinicName"]} fields={[
        { name: "clinicName", label: copy.clinicName, maxLength: 150 },
        { name: "tagline", label: copy.tagline, maxLength: 250 },
        { name: "description", label: copy.description, maxLength: 5_000, multiline: true },
        { name: "address", label: copy.address, maxLength: 300, multiline: true },
      ]} /></div></section>
      <section className="rounded-xl border bg-card p-5 shadow-sm"><h2 className="text-xl font-semibold">{copy.contactAndLinks}</h2><div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className={labelClass}>{copy.phone}<input className={fieldClass} name="phone" maxLength={30} defaultValue={clinic.phone} disabled={pending} /></label>
        <label className={labelClass}>{copy.secondaryPhone}<input className={fieldClass} name="secondaryPhone" maxLength={30} defaultValue={clinic.secondaryPhone} disabled={pending} /></label>
        <label className={labelClass}>{copy.email}<input className={fieldClass} name="email" type="email" maxLength={254} defaultValue={clinic.email} disabled={pending} /></label>
        <label className={labelClass}>{copy.mapUrl}<input className={fieldClass} name="mapUrl" type="url" maxLength={2_048} defaultValue={clinic.mapUrl} disabled={pending} /></label>
        <label className={labelClass}>{copy.latitude}<input className={fieldClass} name="latitude" type="number" min={-90} max={90} step="any" defaultValue={clinic.latitude ?? ""} disabled={pending} /></label>
        <label className={labelClass}>{copy.longitude}<input className={fieldClass} name="longitude" type="number" min={-180} max={180} step="any" defaultValue={clinic.longitude ?? ""} disabled={pending} /></label>
        {(["instagram", "facebook", "whatsapp", "telegram"] as const).map((platform) => <label key={platform} className={labelClass}>{copy[platform]}<input className={fieldClass} name={platform} type="url" maxLength={2_048} defaultValue={clinic.socialLinks[platform]} disabled={pending} /></label>)}
      </div></section>
      <section className="rounded-xl border bg-card p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">{copy.bookingPolicy}</h2><span className="rounded-full bg-muted px-3 py-1.5 text-xs">{copy.timezone}: {clinic.timezone}</span></div><p className="mt-2 text-xs text-muted-foreground">{copy.scheduleRevision}: {clinic.scheduleRevision}</p><div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className={labelClass}>{copy.slotInterval}<select className={fieldClass} name="slotIntervalMinutes" defaultValue={booking.slotIntervalMinutes} disabled={pending}>{[10, 15, 20, 30, 60].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className={labelClass}>{copy.minimumNotice}<input className={fieldClass} name="minBookingNoticeMinutes" type="number" min={0} max={10_080} step={1} defaultValue={booking.minBookingNoticeMinutes} disabled={pending} /></label>
        <label className={labelClass}>{copy.bookingHorizon}<input className={fieldClass} name="maxBookingDaysAhead" type="number" min={1} max={365} step={1} defaultValue={booking.maxBookingDaysAhead} disabled={pending} /></label>
        <label className={labelClass}>{copy.bufferMinutes}<input className={fieldClass} name="bufferMinutes" type="number" min={0} max={120} step={1} defaultValue={booking.bufferMinutes} disabled={pending} /></label>
        <label className={labelClass}>{copy.phoneQuota}<input className={fieldClass} name="maxAppointmentsPerPhonePerDay" type="number" min={1} max={20} step={1} defaultValue={booking.maxAppointmentsPerPhonePerDay} disabled={pending} /></label>
      </div><div className="mt-5 grid gap-2 sm:grid-cols-2">
        <label className="flex min-h-11 items-center gap-3 text-sm font-medium"><input className="size-4" name="isBookingEnabled" type="checkbox" defaultChecked={booking.isBookingEnabled} disabled={pending} />{copy.bookingGloballyEnabled}</label>
        <label className="flex min-h-11 items-center gap-3 text-sm font-medium"><input className="size-4" name="allowSameDayBooking" type="checkbox" defaultChecked={booking.allowSameDayBooking} disabled={pending} />{copy.sameDay}</label>
        <label className="flex min-h-11 items-center gap-3 text-sm font-medium"><input className="size-4" name="requireEmail" type="checkbox" defaultChecked={booking.requireEmail} disabled={pending} />{copy.requireEmail}</label>
        <label className="flex min-h-11 items-center gap-3 text-sm font-medium"><input className="size-4" name="autoConfirmAppointments" type="checkbox" defaultChecked={booking.autoConfirmAppointments} disabled={pending} />{copy.autoConfirm}</label>
      </div></section>
      <div className="sticky bottom-4 flex justify-end"><Button type="submit" size="lg" disabled={pending}><Save aria-hidden="true" />{pending ? copy.saving : copy.save}</Button></div>
    </form>
  );
}

function ClinicAdminContent() {
  const { api, handleApiError } = useStaffAuth();
  const copy = useManagementCopy();
  const [clinic, setClinic] = useState<StaffClinic | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<ManagementFeedbackValue | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setFeedback(null);
    try { setClinic(await api.getClinic(signal)); }
    catch (error) {
      if (error instanceof StaffApiError && error.kind === "cancelled") return;
      handleApiError(error); setFeedback({ ...managementFeedback(error, copy), message: copy.loadError });
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [api, copy, handleApiError]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) void load(controller.signal); });
    return () => controller.abort();
  }, [load]);

  return <section className="max-w-6xl"><ManagementHeader eyebrow={copy.clinicNav} title={copy.clinicTitle} intro={copy.clinicIntro} />{loading ? <p role="status" className="mt-8 text-sm text-muted-foreground">{copy.loading}</p> : clinic ? <><ManagementFeedback value={feedback} /><ClinicSettingsForm key={clinic.updatedAt} clinic={clinic} onSaved={(authoritative) => { setClinic(authoritative); setFeedback({ kind: "success", message: copy.clinicSaved }); }} /></> : <ManagementFeedback value={feedback} onRetry={() => void load()} />}</section>;
}

export function StaffClinicManagement() {
  const { user } = useStaffAuth();
  if (user?.role !== "admin") return <StaffAccessDenied />;
  return <ClinicAdminContent />;
}
