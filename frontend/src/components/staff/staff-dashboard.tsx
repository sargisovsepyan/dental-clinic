"use client";

import Link from "next/link";
import type { Route } from "next";
import { Building2, CalendarClock, CalendarDays, ShieldCheck, Stethoscope, UserRound, UsersRound } from "lucide-react";
import { useStaffAuth } from "@/components/staff/staff-auth-provider";
import { staffManagementMessages } from "@/i18n/staff-management-messages";

export function StaffDashboard() {
  const { locale, copy, user } = useStaffAuth();
  const managementCopy = staffManagementMessages[locale];
  if (!user) return null;
  return (
    <section className="max-w-4xl">
      <p className="text-xs font-bold tracking-[0.14em] text-primary uppercase">{copy.workspace}</p>
      <h1 className="display-type mt-3 text-4xl sm:text-5xl">{copy.dashboardTitle}</h1>
      <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">{copy.dashboardIntro}</p>
      {user.role === "dentist" ? <div className="mt-8 flex gap-4 rounded-xl border bg-card p-6"><ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" /><p className="leading-7">{copy.dentistDashboard}</p></div> : <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <DashboardLink href={`/${locale}/staff/appointments`} icon={CalendarDays} title={copy.appointmentShortcut} body={copy.appointmentsIntro} />
        {user.role === "admin" && <>
          <DashboardLink href={`/${locale}/staff/services`} icon={Stethoscope} title={managementCopy.catalogNav} body={managementCopy.catalogIntro} />
          <DashboardLink href={`/${locale}/staff/dentists`} icon={UsersRound} title={managementCopy.dentistsNav} body={managementCopy.dentistsIntro} />
          <DashboardLink href={`/${locale}/staff/schedules`} icon={CalendarClock} title={managementCopy.schedulesNav} body={managementCopy.schedulesIntro} />
          <DashboardLink href={`/${locale}/staff/clinic`} icon={Building2} title={managementCopy.clinicNav} body={managementCopy.clinicIntro} />
        </>}
        <DashboardLink href={`/${locale}/staff/account`} icon={UserRound} title={copy.account} body={copy.accountIntro} />
      </div>}
    </section>
  );
}

function DashboardLink({ href, icon: Icon, title, body }: {
  href: string;
  icon: typeof CalendarDays;
  title: string;
  body: string;
}) {
  return <Link href={href as Route} className="rounded-xl border bg-card p-6 shadow-sm transition hover:border-primary/40 hover:shadow-md"><Icon aria-hidden="true" className="size-6 text-primary" /><span className="mt-5 block text-lg font-semibold">{title}</span><span className="mt-2 block line-clamp-3 text-sm leading-6 text-muted-foreground">{body}</span></Link>;
}
