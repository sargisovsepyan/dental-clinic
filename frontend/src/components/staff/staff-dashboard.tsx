"use client";

import { ShieldCheck } from "lucide-react";
import { useStaffAuth } from "@/components/staff/staff-auth-provider";

export function StaffDashboard() {
  const { copy, user } = useStaffAuth();
  if (!user) return null;
  return (
    <section className="max-w-4xl">
      <p className="text-xs font-bold tracking-[0.14em] text-primary uppercase">{copy.workspace}</p>
      <h1 className="display-type mt-3 text-4xl sm:text-5xl">{copy.dashboardTitle}</h1>
      <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">{copy.dashboardIntro}</p>
      <div className="mt-8 flex gap-4 rounded-xl border bg-card p-6"><ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" /><p className="leading-7">{user.role === "dentist" ? copy.dentistDashboard : copy.secureArea}</p></div>
    </section>
  );
}
