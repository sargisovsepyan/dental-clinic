"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useRef, useState } from "react";
import { StaffApiError, staffApi } from "@/api/staff-client";
import { StaffAuthCard } from "@/components/staff/staff-auth-card";
import { staffErrorMessage } from "@/components/staff/staff-feedback";
import { useStaffAuth } from "@/components/staff/staff-auth-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { validateNewPassword } from "@/lib/password-policy";

const fieldClass = "mt-2 min-h-11 w-full rounded-md border bg-background px-3 py-2 text-base shadow-sm";

function PasswordFields({ copy, disabled }: { copy: ReturnType<typeof useStaffAuth>["copy"]; disabled: boolean }) {
  return (
    <>
      <label className="block text-sm font-medium">
        {copy.newPassword}
        <input className={fieldClass} name="password" type="password" autoComplete="new-password" required disabled={disabled} aria-describedby="password-policy" />
      </label>
      <p id="password-policy" className="text-xs leading-5 text-muted-foreground">{copy.passwordShort} {copy.passwordLong}</p>
      <label className="block text-sm font-medium">
        {copy.confirmPassword}
        <input className={fieldClass} name="confirmPassword" type="password" autoComplete="new-password" required disabled={disabled} />
      </label>
    </>
  );
}

export function ForgotPasswordForm() {
  const { locale, copy } = useStaffAuth();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    setMessage(null);
    setPending(true);
    const email = String(new FormData(event.currentTarget).get("email") || "").trim().toLowerCase();
    try {
      await staffApi.forgotPassword(email);
      setMessage(copy.forgotSent);
      form.reset();
    } catch (error) {
      setMessage(staffErrorMessage(error, copy));
    } finally {
      setPending(false);
    }
  }
  return (
    <StaffAuthCard locale={locale} title={copy.forgotTitle} intro={copy.forgotIntro}>
      {message && <Alert className="mb-5"><AlertDescription>{message}</AlertDescription></Alert>}
      <form onSubmit={submit} className="space-y-5">
        <label className="block text-sm font-medium">{copy.email}<input className={fieldClass} name="email" type="email" autoComplete="email" required maxLength={254} disabled={pending} /></label>
        <Button className="w-full" size="lg" type="submit" disabled={pending}>{pending ? copy.sending : copy.sendReset}</Button>
      </form>
      <Link href={`/${locale}/staff/login` as Route} className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline">{copy.backToLogin}</Link>
    </StaffAuthCard>
  );
}

export function OneTimePasswordForm({ kind }: { kind: "reset" | "setup" }) {
  const { locale, copy } = useStaffAuth();
  const tokenRef = useRef<string | null | undefined>(undefined);
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (tokenRef.current === undefined) {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const token = params.get("token");
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      tokenRef.current = token && token.length >= 40 && token.length <= 200 ? token : null;
    }
    queueMicrotask(() => { if (active) setHasToken(tokenRef.current !== null); });
    return () => { active = false; };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !tokenRef.current) return;
    const form = event.currentTarget;
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") || "");
    const confirmation = String(data.get("confirmPassword") || "");
    const policy = validateNewPassword(password);
    if (policy || password !== confirmation) {
      setError(policy === "too-short" ? copy.passwordShort : policy === "too-long" ? copy.passwordLong : copy.passwordMismatch);
      return;
    }
    setPending(true);
    setError(null);
    try {
      if (kind === "setup") await staffApi.setupPassword(tokenRef.current, password);
      else await staffApi.resetPassword(tokenRef.current, password);
      tokenRef.current = null;
      form.reset();
      setComplete(true);
    } catch (caught) {
      setError(caught instanceof StaffApiError && (caught.status === 400 || caught.status === 401)
        ? copy.tokenInvalid
        : staffErrorMessage(caught, copy));
    } finally {
      setPending(false);
    }
  }

  const title = kind === "setup" ? copy.setupTitle : copy.resetTitle;
  return (
    <StaffAuthCard locale={locale} title={title} intro={copy.passwordShort + " " + copy.passwordLong}>
      {hasToken === null ? <p role="status">{copy.sessionChecking}</p> : complete ? (
        <Alert><AlertDescription>{copy.resetComplete}</AlertDescription></Alert>
      ) : !hasToken ? (
        <Alert variant="destructive" role="alert"><AlertDescription>{copy.tokenMissing}</AlertDescription></Alert>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          {error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
          <PasswordFields copy={copy} disabled={pending} />
          <Button className="w-full" size="lg" type="submit" disabled={pending}>{pending ? copy.savingPassword : copy.savePassword}</Button>
        </form>
      )}
      <Link href={`/${locale}/staff/login` as Route} className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline">{copy.backToLogin}</Link>
    </StaffAuthCard>
  );
}

export function ChangePasswordForm() {
  const { copy, changePassword } = useStaffAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    const current = String(data.get("currentPassword") || "");
    const password = String(data.get("password") || "");
    const confirmation = String(data.get("confirmPassword") || "");
    const policy = validateNewPassword(password);
    if (policy || password !== confirmation) {
      setError(policy === "too-short" ? copy.passwordShort : policy === "too-long" ? copy.passwordLong : copy.passwordMismatch);
      return;
    }
    setError(null);
    setPending(true);
    try {
      await changePassword(current, password);
    } catch (caught) {
      setError(staffErrorMessage(caught, copy));
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit} className="mt-7 max-w-lg space-y-5 rounded-xl border bg-card p-5 sm:p-7">
      {error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
      <label className="block text-sm font-medium">{copy.currentPassword}<input className={fieldClass} name="currentPassword" type="password" autoComplete="current-password" required minLength={6} disabled={pending} /></label>
      <PasswordFields copy={copy} disabled={pending} />
      <Button type="submit" disabled={pending}>{pending ? copy.changingPassword : copy.changePassword}</Button>
    </form>
  );
}
