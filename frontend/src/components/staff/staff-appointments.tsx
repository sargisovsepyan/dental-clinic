"use client";

import Link from "next/link";
import type { Route } from "next";
import { useCallback, useEffect, useState } from "react";
import type { Pagination, StaffAppointment, StaffAppointmentStatus } from "@/api/staff-client";
import { CreateAppointmentDialog } from "@/components/staff/staff-create-appointment";
import { formatClinicDate, statusClass, statusLabel } from "@/components/staff/staff-appointment-helpers";
import type { StaffCatalog } from "@/components/staff/staff-appointment-types";
import { staffErrorMessage } from "@/components/staff/staff-feedback";
import { StaffAccessDenied } from "@/components/staff/staff-shell";
import { useStaffAuth } from "@/components/staff/staff-auth-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Filters = { from: string; to: string; status: "" | StaffAppointmentStatus; dentistId: string; serviceId: string };
const emptyFilters: Filters = { from: "", to: "", status: "", dentistId: "", serviceId: "" };
const fieldClass = "mt-2 min-h-11 w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm";
const statuses: StaffAppointmentStatus[] = ["pending", "confirmed", "checked_in", "in_progress", "completed", "cancelled", "no_show"];

function AppointmentCard({ item, locale, copy }: { item: StaffAppointment; locale: "hy" | "ru" | "en"; copy: ReturnType<typeof useStaffAuth>["copy"] }) {
  return (
    <article className="rounded-xl border bg-card p-5">
      <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">{item.patientName}</h2><p className="mt-1 text-sm text-muted-foreground">{item.patientPhone}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(item.status)}`}>{statusLabel(item.status, copy)}</span></div>
      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-muted-foreground">{copy.date}</dt><dd className="mt-1">{formatClinicDate(item.date, locale)}</dd></div><div><dt className="text-xs text-muted-foreground">{copy.time}</dt><dd className="mt-1">{item.startTime}–{item.endTime}</dd></div><div className="col-span-2"><dt className="text-xs text-muted-foreground">{copy.service}</dt><dd className="mt-1">{item.serviceSnapshot.name}</dd></div></dl>
      <Link href={`/${locale}/staff/appointments/${item._id}` as Route} className={cn(buttonVariants({ variant: "outline" }), "mt-5 w-full")}>{copy.view}</Link>
    </article>
  );
}

export function StaffAppointments({ catalog }: { catalog: StaffCatalog }) {
  const { locale, copy, user, api, handleApiError } = useStaffAuth();
  const [draft, setDraft] = useState<Filters>(emptyFilters);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [appointments, setAppointments] = useState<StaffAppointment[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, pages: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!user || user.role === "dentist" || signal?.aborted) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.listAppointments({
        page, limit: 25,
        ...(filters.from ? { from: filters.from } : {}),
        ...(filters.to ? { to: filters.to } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.dentistId ? { dentistId: filters.dentistId } : {}),
        ...(filters.serviceId ? { serviceId: filters.serviceId } : {}),
      }, signal);
      setAppointments(result.appointments);
      setPagination(result.pagination);
    } catch (caught) {
      if (signal?.aborted) return;
      handleApiError(caught);
      setError(staffErrorMessage(caught, copy));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
    void reloadVersion;
  }, [api, copy, filters, handleApiError, page, reloadVersion, user]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) void load(controller.signal); });
    return () => controller.abort();
  }, [load]);

  if (user?.role === "dentist") return <StaffAccessDenied />;
  return (
    <section>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-bold tracking-[0.14em] text-primary uppercase">{copy.appointments}</p><h1 className="display-type mt-3 text-4xl sm:text-5xl">{copy.appointmentsTitle}</h1><p className="mt-3 max-w-2xl leading-7 text-muted-foreground">{copy.appointmentsIntro}</p></div>
        <CreateAppointmentDialog catalog={catalog} onCreated={() => { setNotice(copy.appointmentCreated); setPage(1); setReloadVersion((value) => value + 1); }} />
      </div>
      {notice && <Alert className="mt-6" role="status"><AlertDescription>{notice}</AlertDescription></Alert>}
      <form className="mt-7 grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2 xl:grid-cols-5" onSubmit={(event) => { event.preventDefault(); setNotice(null); setPage(1); setFilters(draft); }}>
        <h2 className="text-base font-semibold sm:col-span-2 xl:col-span-5">{copy.filters}</h2>
        <label className="text-sm font-medium">{copy.from}<input className={fieldClass} type="date" value={draft.from} max={draft.to || undefined} onChange={(event) => setDraft((value) => ({ ...value, from: event.target.value }))} /></label>
        <label className="text-sm font-medium">{copy.to}<input className={fieldClass} type="date" value={draft.to} min={draft.from || undefined} onChange={(event) => setDraft((value) => ({ ...value, to: event.target.value }))} /></label>
        <label className="text-sm font-medium">{copy.status}<select className={fieldClass} value={draft.status} onChange={(event) => setDraft((value) => ({ ...value, status: event.target.value as Filters["status"] }))}><option value="">{copy.allStatuses}</option>{statuses.map((status) => <option key={status} value={status}>{statusLabel(status, copy)}</option>)}</select></label>
        <label className="text-sm font-medium">{copy.dentist}<select className={fieldClass} value={draft.dentistId} onChange={(event) => setDraft((value) => ({ ...value, dentistId: event.target.value }))}><option value="">{copy.allDentists}</option>{catalog.dentists.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="text-sm font-medium">{copy.service}<select className={fieldClass} value={draft.serviceId} onChange={(event) => setDraft((value) => ({ ...value, serviceId: event.target.value }))}><option value="">{copy.allServices}</option>{catalog.services.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row xl:col-span-5"><Button type="submit">{copy.applyFilters}</Button><Button type="button" variant="outline" onClick={() => { setDraft(emptyFilters); setFilters(emptyFilters); setPage(1); }}>{copy.clearFilters}</Button></div>
      </form>
      {error && <Alert variant="destructive" className="mt-6" role="alert"><AlertDescription>{error}</AlertDescription><Button className="mt-4" variant="outline" onClick={() => void load()}>{copy.refresh}</Button></Alert>}
      {loading ? <p className="mt-8 text-sm text-muted-foreground" role="status">{copy.loadingAppointments}</p> : !error && appointments.length === 0 ? <p className="mt-8 rounded-xl border border-dashed p-8 text-center text-muted-foreground">{copy.noAppointments}</p> : (
        <>
          <div className="mt-7 grid gap-4 md:hidden">{appointments.map((item) => <AppointmentCard key={item._id} item={item} locale={locale} copy={copy} />)}</div>
          <div className="mt-7 hidden overflow-x-auto rounded-xl border bg-card md:block"><table className="w-full min-w-[760px] border-collapse text-left text-sm"><thead className="bg-muted/70 text-xs text-muted-foreground"><tr><th className="p-4 font-semibold">{copy.time}</th><th className="p-4 font-semibold">{copy.patient}</th><th className="p-4 font-semibold">{copy.service}</th><th className="p-4 font-semibold">{copy.status}</th><th className="p-4 font-semibold"><span className="sr-only">{copy.actions}</span></th></tr></thead><tbody>{appointments.map((item) => <tr key={item._id} className="border-t"><td className="p-4"><span className="font-medium">{formatClinicDate(item.date, locale)}</span><span className="mt-1 block text-muted-foreground">{item.startTime}–{item.endTime}</span></td><td className="p-4"><span className="font-medium">{item.patientName}</span><span className="mt-1 block text-muted-foreground">{item.patientPhone}</span></td><td className="p-4">{item.serviceSnapshot.name}<span className="mt-1 block text-muted-foreground">{item.dentistSnapshot.firstName} {item.dentistSnapshot.lastName}</span></td><td className="p-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(item.status)}`}>{statusLabel(item.status, copy)}</span></td><td className="p-4 text-right"><Link href={`/${locale}/staff/appointments/${item._id}` as Route} className={buttonVariants({ variant: "ghost" })}>{copy.view}</Link></td></tr>)}</tbody></table></div>
        </>
      )}
      {pagination.pages > 1 && <nav aria-label={copy.page.replace("{page}", String(pagination.page)).replace("{pages}", String(pagination.pages))} className="mt-6 flex items-center justify-between gap-4"><Button variant="outline" disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)}>{copy.previous}</Button><span className="text-sm text-muted-foreground">{copy.page.replace("{page}", String(pagination.page)).replace("{pages}", String(pagination.pages))}</span><Button variant="outline" disabled={loading || page >= pagination.pages} onClick={() => setPage((value) => value + 1)}>{copy.next}</Button></nav>}
    </section>
  );
}
