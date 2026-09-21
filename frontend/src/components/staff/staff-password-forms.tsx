"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useRef, useState } from "react";
import { StaffApiError, staffApi, type InvitationContext } from "@/api/staff-client";
import { StaffAuthCard } from "@/components/staff/staff-auth-card";
import { staffErrorMessage } from "@/components/staff/staff-feedback";
import { useStaffAuth } from "@/components/staff/staff-auth-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { correctiveMessages } from "@/i18n/corrective-messages";
import { validateNewPassword } from "@/lib/password-policy";
import { isEmail } from '../../../../shared/booking-input.mjs';
import { getFrontendEnvironment } from '@/lib/env';
import { staffOnboardingMessages } from '@/i18n/staff-onboarding-messages';

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
    const rawEmail = String(new FormData(event.currentTarget).get("email") || "");
    if (!isEmail(rawEmail, true)) {
      setMessage(correctiveMessages[locale].invalidEmail);
      return;
    }
    setPending(true);
    const email = rawEmail.trim().toLowerCase();
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
      <form onSubmit={submit} className="space-y-5" noValidate>
        <label className="block text-sm font-medium">{copy.email}<input className={fieldClass} name="email" type="email" autoComplete="email" required maxLength={254} disabled={pending} /></label>
        <Button className="w-full" size="lg" type="submit" disabled={pending}>{pending ? copy.sending : copy.sendReset}</Button>
      </form>
      <Link href={`/${locale}/staff/login` as Route} className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline">{copy.backToLogin}</Link>
    </StaffAuthCard>
  );
}

export function OneTimePasswordForm({ kind }: { kind: "reset" | "setup" }) {
  const { locale, copy } = useStaffAuth();
  const onboarding = staffOnboardingMessages[locale];
  const tokenRef = useRef<string | null | undefined>(undefined);
  const previewInvitationRef = useRef<string | null>(null);
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  const [context, setContext] = useState<InvitationContext | null>(null);
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const hydrateCapturedCredential = () => {
      if (!active) return;
      const available = tokenRef.current !== null || Boolean(previewInvitationRef.current);
      setHasToken(available);
      setComplete(false);
      setError(null);
      if (kind === 'setup' && available) {
        const request = previewInvitationRef.current
          ? staffApi.getPreviewInvitationContext(previewInvitationRef.current)
          : staffApi.getInvitationContext(tokenRef.current!);
        void request.then((value) => { if (active) setContext(value); }, () => {
          if (active) { setHasToken(false); setContext(null); setError(onboarding.invitationUnavailable); }
        });
      }
    };
    const captureToken = () => {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const token = params.get("token");
      const previewInvitation = kind === 'setup' && getFrontendEnvironment().previewMode
        ? new URLSearchParams(window.location.search).get('previewInvitation') : null;
      const visibleSearch = new URLSearchParams(window.location.search);
      visibleSearch.delete('previewInvitation');
      const visibleQuery = visibleSearch.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${visibleQuery ? `?${visibleQuery}` : ''}`);
      tokenRef.current = token && token.length >= 40 && token.length <= 200 ? token : null;
      previewInvitationRef.current = previewInvitation;
      queueMicrotask(hydrateCapturedCredential);
    };
    if (tokenRef.current === undefined) captureToken();
    else queueMicrotask(hydrateCapturedCredential);
    window.addEventListener("hashchange", captureToken);
    return () => {
      active = false;
      window.removeEventListener("hashchange", captureToken);
    };
  }, [kind, onboarding.invitationUnavailable]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || (!tokenRef.current && !previewInvitationRef.current)) return;
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
      if (kind === "setup" && previewInvitationRef.current) await staffApi.setupPreviewInvitation(previewInvitationRef.current, password);
      else if (kind === "setup") await staffApi.setupPassword(tokenRef.current!, password);
      else await staffApi.resetPassword(tokenRef.current!, password);
      tokenRef.current = null;
      previewInvitationRef.current = null;
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
      {hasToken === null || (kind === 'setup' && hasToken && !context) ? <p role="status">{kind === 'setup' ? onboarding.loadingInvitation : copy.sessionChecking}</p> : complete ? (
        <Alert><AlertDescription>{kind === 'setup' ? onboarding.activationComplete : copy.resetComplete}</AlertDescription></Alert>
      ) : !hasToken ? (
        <Alert variant="destructive" role="alert"><AlertDescription>{kind === 'setup' ? onboarding.invitationUnavailable : copy.tokenMissing}</AlertDescription></Alert>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          {kind === 'setup' && context && <div className="rounded-xl border bg-muted/35 p-4 text-sm"><p className="font-semibold">{onboarding.setupBrand}</p><p className="mt-1 text-muted-foreground">{onboarding.setupIntro}</p><dl className="mt-4 space-y-2"><div><dt className="text-muted-foreground">{onboarding.employee}</dt><dd>{context.nameTranslations?.[locale] || context.name}</dd></div><div><dt className="text-muted-foreground">{copy.email}</dt><dd className="break-all">{context.email}</dd></div><div><dt className="text-muted-foreground">{onboarding.role}</dt><dd>{context.role === 'admin' ? copy.roleAdmin : context.role === 'receptionist' ? copy.roleReceptionist : copy.roleDentist}</dd></div>{context.dentist && <div><dt className="text-muted-foreground">{onboarding.dentistProfile}</dt><dd>{[context.dentist.translations[locale]?.firstName || context.dentist.firstName, context.dentist.translations[locale]?.lastName || context.dentist.lastName].filter(Boolean).join(' ')}</dd></div>}</dl></div>}
          {error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
          <PasswordFields copy={copy} disabled={pending} />
          <Button className="w-full" size="lg" type="submit" disabled={pending}>{pending ? copy.savingPassword : kind === 'setup' ? onboarding.activateAccount : copy.savePassword}</Button>
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
