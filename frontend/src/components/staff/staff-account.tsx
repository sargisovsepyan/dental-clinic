"use client";

import { ChangePasswordForm } from "@/components/staff/staff-password-forms";
import { useStaffAuth } from "@/components/staff/staff-auth-provider";

export function StaffAccount() {
  const { copy, user } = useStaffAuth();
  if (!user) return null;
  return (
    <section>
      <p className="text-xs font-bold tracking-[0.14em] text-primary uppercase">{copy.account}</p>
      <h1 className="display-type mt-3 text-4xl sm:text-5xl">{copy.accountTitle}</h1>
      <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">{copy.accountIntro}</p>
      <dl className="mt-7 grid max-w-2xl gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2">
        <div><dt className="text-xs font-semibold text-muted-foreground">{copy.email}</dt><dd className="mt-1 break-all text-sm">{user.email}</dd></div>
        <div><dt className="text-xs font-semibold text-muted-foreground">{copy.role}</dt><dd className="mt-1 text-sm">{user.role === "admin" ? copy.roleAdmin : user.role === "receptionist" ? copy.roleReceptionist : copy.roleDentist}</dd></div>
      </dl>
      <ChangePasswordForm />
    </section>
  );
}
