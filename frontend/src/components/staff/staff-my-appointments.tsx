"use client";

import { useEffect, useState } from 'react';
import { StaffApiError, type AssignedAppointment } from '@/api/staff-client';
import { useStaffAuth } from './staff-auth-provider';
import { StaffAccessDenied } from './staff-shell';
import { formatClinicDate, statusClass, statusLabel } from './staff-appointment-helpers';
import { productMessages } from '@/i18n/product-messages';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export function StaffMyAppointments() {
  const { user } = useStaffAuth();
  // No management catalog, clinic, or patient-list fetch mounts for this role.
  return user?.role === 'dentist' ? <MyAppointments key={user.id} /> : <StaffAccessDenied />;
}

function MyAppointments() {
  const { api, copy, locale, handleApiError } = useStaffAuth();
  const text = productMessages[locale];
  const [period, setPeriod] = useState<'upcoming' | 'today'>('upcoming');
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<Awaited<ReturnType<typeof api.listMyAppointments>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AssignedAppointment | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(async () => {
      if (controller.signal.aborted) return;
      setLoading(true); setError(null); setResult(null); setSelected(null);
      try {
        // The server, not the browser clock, supplies the clinic-local day.
        const upcoming = await api.listMyAppointments({ page: period === 'today' ? 1 : page, limit: 12 }, controller.signal);
        const data = period === 'today'
          ? await api.listMyAppointments({ page, limit: 12, date: upcoming.today }, controller.signal)
          : upcoming;
        if (!controller.signal.aborted) setResult(data);
      } catch (caught) {
        if (controller.signal.aborted) return;
        handleApiError(caught);
        setError(caught instanceof StaffApiError && caught.code === 'DENTIST_PROFILE_REQUIRED' ? text.profileRequired : copy.appointmentsError);
      } finally { if (!controller.signal.aborted) setLoading(false); }
    });
    return () => controller.abort();
  }, [api, copy.appointmentsError, handleApiError, page, period, refresh, text.profileRequired]);

  return <section className="max-w-5xl">
    <h1 className="display-type text-4xl sm:text-5xl">{text.myAppointments}</h1>
    <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">{text.myIntro}</p>
    <div className="mt-7 flex flex-wrap gap-3">
      {(['upcoming', 'today'] as const).map((value) => <Button key={value} variant={period === value ? 'secondary' : 'outline'} aria-pressed={period === value} onClick={() => { setResult(null); setSelected(null); setPeriod(value); setPage(1); }}>{text[value]}</Button>)}
      <Button variant="outline" onClick={() => { setResult(null); setSelected(null); setRefresh((value) => value + 1); }}>{copy.refresh}</Button>
    </div>
    {loading ? <p role="status" className="mt-8">{copy.loadingAppointments}</p> : error ? <Alert className="mt-8"><AlertDescription>{error}</AlertDescription></Alert> : result && <>
      <p className="mt-5 text-sm text-muted-foreground">{copy.clinicTime}: {result.timezone}</p>
      {result.appointments.length === 0 ? <p className="mt-6 rounded-xl border bg-card p-6">{text.myEmpty}</p> : <div className="mt-6 grid gap-4 md:grid-cols-2">
        {result.appointments.map((item) => <article key={item._id} className="min-w-0 rounded-xl border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><h2 className="text-lg font-semibold">{formatClinicDate(item.date, locale)} · {item.startTime}–{item.endTime}</h2><span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(item.status)}`}>{statusLabel(item.status, copy)}</span></div>
          <p className="mt-4 break-words font-medium">{item.patientName}</p>
          <p className="mt-2 break-words text-sm text-muted-foreground">{String(item.serviceSnapshot.translations?.[locale]?.name || (locale === 'hy' ? item.serviceSnapshot.name : text.untranslated))}</p>
          <Button className="mt-4" variant="outline" aria-expanded={selected?._id === item._id} onClick={() => setSelected(selected?._id === item._id ? null : item)}>{copy.view}</Button>
          {selected?._id === item._id && <dl className="mt-4 border-t pt-4"><dt className="text-sm text-muted-foreground">{copy.phone}</dt><dd className="mt-1 break-words">{item.patientPhone}</dd></dl>}
        </article>)}
      </div>}
      <div className="mt-6 flex flex-wrap items-center gap-3"><Button variant="outline" disabled={page <= 1} onClick={() => { setResult(null); setPage((value) => value - 1); }}>{copy.previous}</Button><span className="text-sm">{copy.page.replace('{page}', String(page)).replace('{pages}', String(Math.max(1, result.pagination.pages)))}</span><Button variant="outline" disabled={page >= result.pagination.pages} onClick={() => { setResult(null); setPage((value) => value + 1); }}>{copy.next}</Button></div>
    </>}
  </section>;
}
