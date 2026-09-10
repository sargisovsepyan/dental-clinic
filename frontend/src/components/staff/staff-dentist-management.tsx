"use client";

import { Archive, Pencil, Plus, RotateCcw, UserRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StaffApiError } from "@/api/staff-client";
import type {
  CreateDentistPayload,
  DentistLanguage,
  StaffDentist,
  StaffService,
  UpdateDentistPayload,
} from "@/api/staff-management";
import { useStaffAuth } from "@/components/staff/staff-auth-provider";
import { StaffAccessDenied } from "@/components/staff/staff-shell";
import {
  compactTranslations,
  ConfirmActionDialog,
  fieldClass,
  labelClass,
  LocalizedFields,
  localizedDraft,
  ManagementFeedback,
  ManagementHeader,
  managementFeedback,
  StatusBadge,
  useManagementCopy,
  type LocalizedDraft,
  type ManagementFeedbackValue,
} from "@/components/staff/staff-management-shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { Locale } from "@/i18n/locales";

const languageValues: DentistLanguage[] = ["hy", "ru", "en", "fr", "de", "other"];

function dentistName(dentist: StaffDentist) {
  return `${dentist.firstName} ${dentist.lastName}`;
}

function serviceName(service: StaffService, locale: Locale) {
  return service.translations[locale]?.name || service.translations.hy?.name || service.name;
}

function sameIds(first: string[], second: string[]) {
  return first.length === second.length && [...first].sort().every((value, index) => value === [...second].sort()[index]);
}

function DentistDialog({ value, services, open, pending, onOpenChange, onSubmit }: {
  value: StaffDentist | null;
  services: StaffService[];
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: CreateDentistPayload | UpdateDentistPayload) => Promise<void>;
}) {
  const { locale } = useStaffAuth();
  const copy = useManagementCopy();
  const [translations, setTranslations] = useState<LocalizedDraft>(() => localizedDraft(value?.translations, ["title", "bio", "specializations"]));
  const [active, setActive] = useState(value?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const assignedIds = useMemo(
    () => value?.services.map((service) => service._id) ?? [],
    [value],
  );
  const availableServices = useMemo(
    () => services.filter((service) => service.isActive || assignedIds.includes(service._id)),
    [assignedIds, services],
  );

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    const firstName = String(data.get("firstName") || "").trim();
    const lastName = String(data.get("lastName") || "").trim();
    const experienceYears = Number(data.get("experienceYears"));
    const sortOrder = Number(data.get("sortOrder"));
    const languages = data.getAll("languages").map(String) as DentistLanguage[];
    const selectedServices = data.getAll("services").map(String);
    const specializations = translations.hy.specializations.trim().split(/\r?\n/).filter(Boolean);
    if (firstName.length < 2 || lastName.length < 2 || (active && translations.hy.title.trim().length < 2) ||
        specializations.some((item) => item.trim().length < 2) || specializations.length > 20 ||
        !Number.isInteger(experienceYears) || experienceYears < 0 || experienceYears > 70 ||
        !Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 10_000) {
      setError(copy.validationError);
      return;
    }
    const common: UpdateDentistPayload = {
      firstName, lastName,
      translations: compactTranslations(translations, ["specializations"]) as CreateDentistPayload["translations"],
      experienceYears,
      languages,
      services: selectedServices,
      isFeatured: data.get("isFeatured") === "on",
      bookingEnabled: data.get("bookingEnabled") === "on",
      sortOrder,
    };
    if (value && sameIds(assignedIds, selectedServices)) delete common.services;
    setError(null);
    await onSubmit(value ? common : {
      ...common,
      services: selectedServices,
      weeklySchedule: [],
      isActive: active,
    } as CreateDentistPayload);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent closeLabel={copy.cancel} className="w-[min(calc(100%-2rem),50rem)]">
        <DialogTitle>{value ? copy.editDentist : copy.addDentist}</DialogTitle>
        <DialogDescription className="mt-2">{copy.generatedSlug} {copy.mediaDeferred}</DialogDescription>
        {error && <Alert variant="destructive" className="mt-4"><AlertDescription>{error}</AlertDescription></Alert>}
        <form onSubmit={submit} className="mt-5 space-y-5" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>{copy.firstName}<input className={fieldClass} name="firstName" defaultValue={value?.firstName ?? ""} minLength={2} maxLength={80} required disabled={pending} /></label>
            <label className={labelClass}>{copy.lastName}<input className={fieldClass} name="lastName" defaultValue={value?.lastName ?? ""} minLength={2} maxLength={80} required disabled={pending} /></label>
          </div>
          <LocalizedFields
            value={translations}
            onChange={setTranslations}
            disabled={pending}
            primaryRequired={active ? ["title"] : []}
            fields={[
              { name: "title", label: copy.title, maxLength: 150 },
              { name: "bio", label: copy.bio, maxLength: 5_000, multiline: true },
              { name: "specializations", label: copy.specializations, maxLength: 2_019, multiline: true },
            ]}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>{copy.experienceYears}<input className={fieldClass} name="experienceYears" type="number" min={0} max={70} step={1} defaultValue={value?.experienceYears ?? 0} required disabled={pending} /></label>
            <label className={labelClass}>{copy.sortOrder}<input className={fieldClass} name="sortOrder" type="number" min={0} max={10_000} step={1} defaultValue={value?.sortOrder ?? 0} required disabled={pending} /></label>
          </div>
          <fieldset className="rounded-xl border p-4"><legend className="px-1 text-sm font-semibold">{copy.languages}</legend><div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">{languageValues.map((language) => <label key={language} className="flex min-h-10 items-center gap-2 text-sm"><input className="size-4" type="checkbox" name="languages" value={language} defaultChecked={value?.languages.includes(language) ?? language === "hy"} disabled={pending} />{language.toUpperCase()}</label>)}</div></fieldset>
          <fieldset className="rounded-xl border p-4"><legend className="px-1 text-sm font-semibold">{copy.assignedServices}</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{availableServices.length === 0 ? <p className="text-sm text-muted-foreground">{copy.noServices}</p> : availableServices.map((service) => <label key={service._id} className="flex min-h-11 items-center gap-3 rounded-lg border bg-background px-3 text-sm"><input className="size-4" type="checkbox" name="services" value={service._id} defaultChecked={assignedIds.includes(service._id)} disabled={pending || !service.isActive} />{serviceName(service, locale)}{!service.isActive && <span className="ml-auto text-xs text-muted-foreground">{copy.inactive}</span>}</label>)}</div></fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex min-h-11 items-center gap-3 text-sm font-medium"><input className="size-4" name="bookingEnabled" type="checkbox" defaultChecked={value?.bookingEnabled ?? false} disabled={pending} />{copy.bookingEnabled}</label>
            <label className="flex min-h-11 items-center gap-3 text-sm font-medium"><input className="size-4" name="isFeatured" type="checkbox" defaultChecked={value?.isFeatured ?? false} disabled={pending} />{copy.featured}</label>
            {!value && <label className="flex min-h-11 items-center gap-3 text-sm font-medium"><input className="size-4" type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} disabled={pending} />{copy.publishNow}</label>}
          </div>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>{copy.cancel}</Button><Button type="submit" disabled={pending}>{pending ? copy.saving : value ? copy.save : copy.create}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DentistAdminContent() {
  const { locale, api, handleApiError } = useStaffAuth();
  const copy = useManagementCopy();
  const [dentists, setDentists] = useState<StaffDentist[]>([]);
  const [services, setServices] = useState<StaffService[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<ManagementFeedbackValue | null>(null);
  const [editor, setEditor] = useState<{ open: boolean; value: StaffDentist | null }>({ open: false, value: null });
  const [archiveTarget, setArchiveTarget] = useState<StaffDentist | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setFeedback(null);
    try {
      const [nextDentists, nextServices] = await Promise.all([api.listDentists(signal), api.listServices(signal)]);
      setDentists(nextDentists); setServices(nextServices);
    } catch (error) {
      if (error instanceof StaffApiError && error.kind === "cancelled") return;
      handleApiError(error); setFeedback({ ...managementFeedback(error, copy), message: copy.loadError });
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [api, copy, handleApiError]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) void load(controller.signal); });
    return () => controller.abort();
  }, [load]);

  async function mutate(operation: () => Promise<void>, close: () => void) {
    if (pending) return;
    setPending(true); setFeedback(null);
    try {
      await operation(); await load(); close(); setFeedback({ kind: "success", message: copy.saved });
    } catch (error) {
      handleApiError(error); setFeedback(error instanceof StaffApiError && error.status === 409
        ? { ...managementFeedback(error, copy), message: copy.relationUnavailable }
        : managementFeedback(error, copy));
    } finally { setPending(false); }
  }

  return (
    <section className="max-w-7xl">
      <ManagementHeader eyebrow={copy.dentistsNav} title={copy.dentistsTitle} intro={copy.dentistsIntro} action={<Button onClick={() => setEditor({ open: true, value: null })} disabled={loading}><Plus aria-hidden="true" />{copy.addDentist}</Button>} />
      <ManagementFeedback value={feedback} onRetry={() => void load()} />
      {loading ? <p role="status" className="mt-8 text-sm text-muted-foreground">{copy.loading}</p> : dentists.length === 0 ? <p className="mt-8 rounded-xl border bg-card p-6 text-muted-foreground">{copy.noDentists}</p> : <div className="mt-7 grid gap-4 lg:grid-cols-2">
        {dentists.map((dentist) => {
          const title = dentist.translations[locale]?.title || dentist.translations.hy?.title || dentist.title;
          return <article key={dentist._id} className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-start gap-4"><span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary"><UserRound aria-hidden="true" className="size-5" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{dentistName(dentist)}</h2><p className="mt-1 text-sm text-muted-foreground">{title || "—"}</p></div><StatusBadge active={dentist.isActive} copy={copy} /></div></div></div>
            <p className="mt-4 text-sm text-muted-foreground">{dentist.services.map((service) => service.translations[locale]?.name || service.translations.hy?.name || service.name).join(" · ") || "—"}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-muted px-2.5 py-1">{copy.scheduleRevision}: {dentist.scheduleRevision}</span><span className="rounded-full bg-muted px-2.5 py-1">{dentist.bookingEnabled ? copy.bookingEnabled : `¬ ${copy.bookingEnabled}`}</span>{dentist.isFeatured && <span className="rounded-full bg-secondary px-2.5 py-1">{copy.featured}</span>}</div>
            <div className="mt-5 flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => setEditor({ open: true, value: dentist })}><Pencil aria-hidden="true" />{copy.edit}</Button>{dentist.isActive ? <Button variant="destructive" size="sm" onClick={() => setArchiveTarget(dentist)}><Archive aria-hidden="true" />{copy.archive}</Button> : <Button variant="secondary" size="sm" disabled={pending} onClick={() => void mutate(() => api.restoreDentist(dentist._id), () => undefined)}><RotateCcw aria-hidden="true" />{copy.restore}</Button>}</div>
          </article>;
        })}
      </div>}
      {editor.open && <DentistDialog value={editor.value} services={services} open pending={pending} onOpenChange={(open) => setEditor((current) => ({ ...current, open }))} onSubmit={(payload) => mutate(() => editor.value ? api.updateDentist(editor.value._id, payload as UpdateDentistPayload).then(() => undefined) : api.createDentist(payload as CreateDentistPayload), () => setEditor({ open: false, value: null }))} />}
      <ConfirmActionDialog open={Boolean(archiveTarget)} onOpenChange={(open) => !open && setArchiveTarget(null)} title={copy.archiveDentistTitle} body={copy.archiveDentistBody} pending={pending} onConfirm={() => archiveTarget && void mutate(() => api.disableDentist(archiveTarget._id), () => setArchiveTarget(null))} />
    </section>
  );
}

export function StaffDentistManagement() {
  const { user } = useStaffAuth();
  if (user?.role !== "admin") return <StaffAccessDenied />;
  return <DentistAdminContent />;
}
