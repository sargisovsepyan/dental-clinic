"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useEffect, useState } from "react";
import { StaffApiError } from "@/api/staff-client";
import { StaffAuthCard } from "@/components/staff/staff-auth-card";
import { staffErrorMessage } from "@/components/staff/staff-feedback";
import { useStaffAuth } from "@/components/staff/staff-auth-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { correctiveMessages } from "@/i18n/corrective-messages";
import { isEmail } from '../../../../shared/booking-input.mjs';

import { StaffLanguageSwitcher } from './staff-language-switcher';

const fieldClass = "mt-2 min-h-11 w-full rounded-md border bg-background px-3 py-2 text-base shadow-sm";

export function StaffLoginForm() {
  const { locale, copy, status, user, notice, login, clearNotice } = useStaffAuth();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);

  useEffect(() => {
    if (status === "authenticated" && user) router.replace(`/${locale}/staff${user.role === 'dentist' ? '/my-appointments' : ''}` as Route);
  }, [locale, router, status, user]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    clearNotice();
    setError(null);
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") || "");
    if (!isEmail(email, true)) {
      setError({ message: correctiveMessages[locale].invalidEmail });
      return;
    }
    setPending(true);
    try {
      await login(email.trim().toLowerCase(), String(data.get("password") || ""));
    } catch (caught) {
      setError({
        message: staffErrorMessage(caught, copy),
        requestId: caught instanceof StaffApiError ? caught.requestId : undefined,
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <StaffAuthCard locale={locale} title={copy.loginTitle} intro={copy.loginIntro}>
      <div className="mb-5"><StaffLanguageSwitcher locale={locale} /></div>
      {(notice || error) && (
        <Alert variant={error ? "destructive" : "default"} className="mb-5" role={error ? "alert" : "status"}>
          <AlertDescription>
            {error?.message || notice}
            {error?.requestId && <span className="mt-1 block text-xs">{copy.requestId}: {error.requestId}</span>}
          </AlertDescription>
        </Alert>
      )}
      <form onSubmit={submit} className="space-y-5" noValidate>
        <label className="block text-sm font-medium">
          {copy.email}
          <input className={fieldClass} name="email" type="email" autoComplete="username" required maxLength={254} disabled={pending} />
        </label>
        <label className="block text-sm font-medium">
          {copy.password}
          <input className={fieldClass} name="password" type="password" autoComplete="current-password" required minLength={6} maxLength={1024} disabled={pending} />
        </label>
        <Button className="w-full" size="lg" type="submit" disabled={pending || status === "loading"}>
          {pending ? copy.signingIn : copy.signIn}
        </Button>
      </form>
      <Link href={`/${locale}/staff/forgot-password` as Route} className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline">
        {copy.forgotLink}
      </Link>
    </StaffAuthCard>
  );
}
