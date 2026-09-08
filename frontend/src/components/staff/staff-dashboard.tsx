"use client";

import Link from "next/link";
import type { Route } from "next";
import { CalendarDays, ShieldCheck, UserRound } from "lucide-react";
import { useStaffAuth } from "@/components/staff/staff-auth-provider";

export function StaffDashboard() {
  const { locale, copy, user } = useStaffAuth();
  if (!user) return null;
  return (
    <section className="max-w-4xl">
      <p className="text-xs font-bold tracking-[0.14em] text-primary uppercase">{copy.workspace}</p>
      <h1 className="display-type mt-3 text-4xl sm:text-5xl">{copy.dashboardTitle}</h1>
      <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">{copy.dashboardIntro}</p>
      {user.role === "dentist" ? <div className="mt-8 flex gap-4 rounded-xl border bg-card p-6"><ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" /><p className="leading-7">{copy.dentistDashboard}</p></div> : <div className="mt-8 grid gap-4 sm:grid-cols-2"><Link href={`/${locale}/staff/appointments` as Route} className="rounded-xl border bg-card p-6 shadow-sm transition hover:border-primary/40 hover:shadow-md"><CalendarDays aria-hidden="true" className="size-6 text-primary" /><span className="mt-5 block text-lg font-semibold">{copy.appointmentShortcut}</span><span className="mt-2 block text-sm leading-6 text-muted-foreground">{copy.appointmentsIntro}</span></Link><Link href={`/${locale}/staff/account` as Route} className="rounded-xl border bg-card p-6 shadow-sm transition hover:border-primary/40 hover:shadow-md"><UserRound aria-hidden="true" className="size-6 text-primary" /><span className="mt-5 block text-lg font-semibold">{copy.account}</span><span className="mt-2 block text-sm leading-6 text-muted-foreground">{copy.accountIntro}</span></Link></div>}
    </section>
  );
}
