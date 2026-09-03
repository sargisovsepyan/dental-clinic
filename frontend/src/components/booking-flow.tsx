"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowRight, CalendarDays, Check, Clock3, RefreshCw, ShieldCheck } from "lucide-react";
import {
  BookingApiError,
  canonicalBookingPayload,
  createIdempotencyKey,
  createPublicAppointment,
  getAvailability,
  type AvailabilityReason,
  type AvailabilityView,
  type BookingPayload,
  type BookingResult,
} from "@/api/booking-client";
import { BookingChallenge } from "@/components/booking-challenge";
import { BookingWebMcp } from "@/components/booking-webmcp";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/locales";
import { bookingMessages, type BookingMessages } from "@/i18n/booking-messages";
import { messages } from "@/i18n/messages";
import { bookingDateRange, formatBookingDate } from "@/lib/booking-date";
import { cn } from "@/lib/utils";

export interface BookingServiceOption {
  id: string;
  slug: string;
  name: { text: string; lang?: Locale };
  shortDescription: { text: string; lang?: Locale };
  durationMinutes: number;
}

export interface BookingDentistOption {
  id: string;
  slug: string;
  fullName: string;
  fullNameLang?: Locale;
  title: { text: string; lang?: Locale };
  serviceIds: string[];
}

export interface BookingClinicOptions {
  timezone: string;
  requireEmail: boolean;
  allowSameDayBooking: boolean;
  maxBookingDaysAhead: number;
}

type SubmitError = "conflict" | "validation" | "not-found" | "rate" | "service" | "uncertain" | "generic";
type AvailabilityError = "selection" | "rate" | "service" | "generic";

const fieldClass = "min-h-12 w-full rounded-lg border bg-background px-3.5 text-base outline-none transition-shadow focus:border-ring focus:ring-3 focus:ring-ring/25 disabled:opacity-60";

function reasonMessage(reason: AvailabilityReason, copy: BookingMessages) {
  switch (reason) {
    case "SAME_DAY_BOOKING_DISABLED": return copy.sameDayDisabled;
    case "CLINIC_CLOSED": return copy.closed;
    case "DENTIST_NOT_WORKING": return copy.dentistAway;
    case "NO_COMMON_WORKING_TIME": return copy.noCommonTime;
    default: return copy.unavailable;
  }
}

function submitErrorMessage(error: SubmitError, copy: BookingMessages) {
  switch (error) {
    case "conflict": return copy.conflict;
    case "validation": return copy.validationError;
    case "not-found": return copy.notFoundError;
    case "rate": return copy.rateError;
    case "service": return copy.serviceError;
    case "uncertain": return copy.uncertainError;
    default: return copy.genericError;
  }
}

function availabilityErrorMessage(error: AvailabilityError, copy: BookingMessages) {
  switch (error) {
    case "selection": return copy.selectionChanged;
    case "rate": return copy.rateError;
    case "service": return copy.bookingUnavailable;
    default: return copy.slotsError;
  }
}

function ChoiceButton({
  selected,
  title,
  description,
  lang,
  onClick,
}: {
  selected: boolean;
  title: string;
  description?: string;
  lang?: Locale;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "group relative min-h-24 rounded-xl border p-4 text-left transition-colors hover:border-primary/50 hover:bg-secondary/45",
        selected && "border-primary bg-secondary/65 ring-2 ring-primary/15",
      )}
    >
      <span lang={lang} className="block pr-8 font-bold">{title}</span>
      {description && <span lang={lang} className="mt-2 block text-sm leading-6 text-muted-foreground">{description}</span>}
      {selected && <Check aria-hidden="true" className="absolute right-4 top-4 size-5 text-primary" />}
    </button>
  );
}

function BookingSuccess({
  result,
  locale,
  timezone,
  onReset,
}: {
  result: BookingResult;
  locale: Locale;
  timezone: string;
  onReset: () => void;
}) {
  const copy = bookingMessages[locale];
  const confirmed = result.status === "confirmed";
  return (
    <section className="mx-auto max-w-3xl rounded-2xl border bg-card p-6 shadow-[var(--shadow-soft)] sm:p-10" aria-labelledby="booking-result-title" aria-live="polite">
      <div className="grid size-14 place-items-center rounded-full bg-secondary text-primary">
        <Check aria-hidden="true" className="size-7" />
      </div>
      <p className="eyebrow mt-7">{copy.eyebrow}</p>
      <h2 id="booking-result-title" className="display-type mt-3 text-4xl sm:text-5xl">
        {confirmed ? copy.confirmedTitle : copy.pendingTitle}
      </h2>
      <p className="mt-5 max-w-2xl leading-7 text-muted-foreground">
        {confirmed ? copy.confirmedBody : copy.pendingBody}
      </p>
      <dl className="mt-8 grid gap-5 rounded-xl bg-muted/65 p-5 sm:grid-cols-2">
        <div><dt className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{copy.service}</dt><dd lang={result.service.nameLang} className="mt-1 font-semibold">{result.service.name}</dd></div>
        <div><dt className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{copy.dentist}</dt><dd lang={result.dentist.nameLang} className="mt-1 font-semibold">{result.dentist.firstName} {result.dentist.lastName}</dd></div>
        <div><dt className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{copy.date}</dt><dd className="mt-1 font-semibold">{formatBookingDate(result.date, locale, timezone)}</dd></div>
        <div><dt className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{copy.time}</dt><dd className="mt-1 font-semibold">{result.startTime}–{result.endTime}</dd></div>
      </dl>
      <div className="mt-6 rounded-xl border border-primary/25 p-5">
        <p className="text-sm font-semibold text-muted-foreground">{copy.confirmationCode}</p>
        <p className="mt-2 font-mono text-xl font-bold tracking-wider" data-testid="confirmation-code">{result.confirmationCode}</p>
        <p className="mt-2 text-sm text-muted-foreground">{copy.keepCode}</p>
      </div>
      <Button type="button" variant="outline" className="mt-8" onClick={onReset}>{copy.newBooking}</Button>
    </section>
  );
}

export function BookingFlow({
  locale,
  services,
  dentists,
  clinic,
  challenge,
  initialServiceSlug,
  initialDentistSlug,
}: {
  locale: Locale;
  services: BookingServiceOption[];
  dentists: BookingDentistOption[];
  clinic: BookingClinicOptions;
  challenge: { provider: "disabled" | "turnstile"; siteKey?: string };
  initialServiceSlug?: string;
  initialDentistSlug?: string;
}) {
  const copy = bookingMessages[locale];
  const initialService = services.find((item) => item.slug === initialServiceSlug);
  const requestedDentist = dentists.find((item) => item.slug === initialDentistSlug);
  const initialDentist = requestedDentist && (!initialService || requestedDentist.serviceIds.includes(initialService.id))
    ? requestedDentist
    : undefined;
  const [serviceId, setServiceId] = useState(initialService?.id || "");
  const [dentistId, setDentistId] = useState(initialDentist?.id || "");
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState<string>();
  const [availability, setAvailability] = useState<AvailabilityView>();
  const [availabilityStatus, setAvailabilityStatus] = useState<"idle" | "loading" | "error">("idle");
  const [availabilityError, setAvailabilityError] = useState<AvailabilityError>();
  const [retryAfterSeconds, setRetryAfterSeconds] = useState<number>();
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientEmail, setPatientEmail] = useState("");
  const [patientComment, setPatientComment] = useState("");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [challengeToken, setChallengeToken] = useState<string>();
  const [challengeFailed, setChallengeFailed] = useState(false);
  const [challengeVersion, setChallengeVersion] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<SubmitError>();
  const [result, setResult] = useState<BookingResult>();
  const requestVersion = useRef(0);
  const activeSubmit = useRef(false);
  const attempt = useRef<{ fingerprint: string; key: string } | undefined>(undefined);
  const availabilityHeading = useRef<HTMLHeadingElement>(null);
  const serviceHeading = useRef<HTMLHeadingElement>(null);
  const submitErrorAlert = useRef<HTMLDivElement>(null);

  const dateRange = useMemo(() => bookingDateRange({
    timezone: clinic.timezone,
    allowSameDay: clinic.allowSameDayBooking,
    maxDaysAhead: clinic.maxBookingDaysAhead,
  }), [clinic.allowSameDayBooking, clinic.maxBookingDaysAhead, clinic.timezone]);
  const selectedService = services.find((item) => item.id === serviceId);
  const selectedDentist = dentists.find((item) => item.id === dentistId);
  const compatibleDentists = serviceId
    ? dentists.filter((item) => item.serviceIds.includes(serviceId))
    : [];

  const resetChallenge = useCallback(() => {
    setChallengeToken(undefined);
    setChallengeFailed(false);
    setChallengeVersion((value) => value + 1);
  }, []);
  const handleChallengeToken = useCallback((token?: string) => {
    setChallengeToken(token);
    if (token) setChallengeFailed(false);
  }, []);
  const handleChallengeError = useCallback(() => setChallengeFailed(true), []);

  useEffect(() => {
    const version = ++requestVersion.current;
    if (!serviceId || !dentistId || !date) return;
    const controller = new AbortController();
    getAvailability({ dentistId, serviceId, date, signal: controller.signal })
      .then((value) => {
        if (requestVersion.current !== version) return;
        setAvailability(value);
        setAvailabilityError(undefined);
        setAvailabilityStatus("idle");
      })
      .catch((error: unknown) => {
        if (requestVersion.current !== version || (error instanceof BookingApiError && error.kind === "cancelled")) return;
        setAvailability(undefined);
        setAvailabilityError(error instanceof BookingApiError
          ? error.status === 400 || error.status === 404
            ? "selection"
            : error.status === 429
              ? "rate"
              : error.status === 503
                ? "service"
                : "generic"
          : "generic");
        setRetryAfterSeconds(error instanceof BookingApiError && error.status === 429
          ? error.retryAfterSeconds
          : undefined);
        setAvailabilityStatus("error");
      });
    return () => controller.abort();
  }, [date, dentistId, refreshVersion, serviceId]);

  const chooseService = useCallback((id: string) => {
    requestVersion.current += 1;
    setServiceId(id);
    if (!dentists.find((item) => item.id === dentistId)?.serviceIds.includes(id)) setDentistId("");
    setDate("");
    setSlot(undefined);
    setAvailability(undefined);
    setAvailabilityError(undefined);
    setAvailabilityStatus("idle");
    setSubmitError(undefined);
    setRetryAfterSeconds(undefined);
  }, [dentistId, dentists]);
  const chooseDentist = useCallback((id: string) => {
    requestVersion.current += 1;
    setDentistId(id);
    setDate("");
    setSlot(undefined);
    setAvailability(undefined);
    setAvailabilityError(undefined);
    setAvailabilityStatus("idle");
    setSubmitError(undefined);
    setRetryAfterSeconds(undefined);
  }, []);
  const chooseDate = useCallback((value: string) => {
    requestVersion.current += 1;
    setDate(value);
    setSlot(undefined);
    setAvailability(undefined);
    setAvailabilityError(undefined);
    setAvailabilityStatus(value ? "loading" : "idle");
    setSubmitError(undefined);
    setRetryAfterSeconds(undefined);
  }, []);
  const stageBooking = useCallback((nextServiceId: string, nextDentistId: string, nextDate?: string) => {
    requestVersion.current += 1;
    setServiceId(nextServiceId);
    setDentistId(nextDentistId);
    setDate(nextDate || "");
    setSlot(undefined);
    setAvailability(undefined);
    setAvailabilityError(undefined);
    setAvailabilityStatus(nextDate ? "loading" : "idle");
    setSubmitError(undefined);
    setRetryAfterSeconds(undefined);
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (activeSubmit.current || !selectedService || !selectedDentist || !date || !slot || !privacyAccepted) return;
    if (challenge.provider === "turnstile" && !challengeToken) {
      setChallengeFailed(true);
      return;
    }
    const payload: BookingPayload = {
      patientName,
      patientPhone,
      patientEmail,
      patientComment,
      dentistId: selectedDentist.id,
      serviceId: selectedService.id,
      date,
      startTime: slot,
      locale,
      privacyAccepted: true,
      ...(challengeToken ? { challengeToken } : {}),
    };
    const fingerprint = canonicalBookingPayload(payload);
    if (!attempt.current || attempt.current.fingerprint !== fingerprint) {
      attempt.current = { fingerprint, key: createIdempotencyKey() };
    }
    activeSubmit.current = true;
    setSubmitting(true);
    setSubmitError(undefined);
    setRetryAfterSeconds(undefined);
    try {
      setResult(await createPublicAppointment(payload, attempt.current.key));
    } catch (error) {
      if (error instanceof BookingApiError) {
        if (error.status === 409) {
          requestVersion.current += 1;
          setSubmitError("conflict");
          setSlot(undefined);
          setAvailability(undefined);
          setAvailabilityError(undefined);
          setAvailabilityStatus("loading");
          setRefreshVersion((value) => value + 1);
          window.setTimeout(() => availabilityHeading.current?.focus(), 0);
        } else if (error.status === 400) setSubmitError("validation");
        else if (error.status === 404) {
          requestVersion.current += 1;
          setSubmitError("not-found");
          setServiceId("");
          setDentistId("");
          setDate("");
          setSlot(undefined);
          setAvailability(undefined);
          setAvailabilityError(undefined);
          setAvailabilityStatus("idle");
          window.setTimeout(() => serviceHeading.current?.focus(), 0);
        } else if (error.status === 429) {
          setSubmitError("rate");
          setRetryAfterSeconds(error.retryAfterSeconds);
        }
        else if (error.status === 503) setSubmitError("service");
        else if (error.kind === "network" || error.kind === "timeout") setSubmitError("uncertain");
        else setSubmitError("generic");
      } else setSubmitError("generic");
      if (!(error instanceof BookingApiError) || (error.status !== 409 && error.status !== 404)) {
        window.setTimeout(() => submitErrorAlert.current?.focus(), 0);
      }
      resetChallenge();
    } finally {
      activeSubmit.current = false;
      setSubmitting(false);
    }
  };

  const resetAll = () => {
    setServiceId("");
    setDentistId("");
    setDate("");
    setSlot(undefined);
    setPatientName("");
    setPatientPhone("");
    setPatientEmail("");
    setPatientComment("");
    setPrivacyAccepted(false);
    setAvailability(undefined);
    setAvailabilityError(undefined);
    setAvailabilityStatus("idle");
    setSubmitError(undefined);
    setRetryAfterSeconds(undefined);
    setResult(undefined);
    attempt.current = undefined;
    resetChallenge();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (result) {
    return <BookingSuccess result={result} locale={locale} timezone={clinic.timezone} onReset={resetAll} />;
  }

  const completedSteps = serviceId ? (dentistId ? (slot ? 3 : 2) : 1) : 0;

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
      <BookingWebMcp services={services} dentists={dentists} onStage={stageBooking} />
      <div className="min-w-0 space-y-6">
        {submitError === "not-found" && <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertTitle>{copy.notFoundError}</AlertTitle></Alert>}
        <section className="rounded-2xl border bg-card p-5 sm:p-7" aria-labelledby="service-heading">
          <h2 ref={serviceHeading} tabIndex={-1} id="service-heading" className="display-type text-2xl sm:text-3xl">{copy.chooseService}</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {services.map((service) => <ChoiceButton key={service.id} selected={service.id === serviceId} title={service.name.text} description={`${service.durationMinutes} ${messages[locale].minutes}${service.shortDescription.text ? ` · ${service.shortDescription.text}` : ""}`} lang={service.name.lang} onClick={() => chooseService(service.id)} />)}
          </div>
        </section>

        {serviceId && (
          <section className="rounded-2xl border bg-card p-5 sm:p-7" aria-labelledby="dentist-heading">
            <h2 id="dentist-heading" className="display-type text-2xl sm:text-3xl">{copy.chooseDentist}</h2>
            {compatibleDentists.length ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {compatibleDentists.map((dentist) => <ChoiceButton key={dentist.id} selected={dentist.id === dentistId} title={dentist.fullName} description={dentist.title.text} lang={dentist.fullNameLang} onClick={() => chooseDentist(dentist.id)} />)}
              </div>
            ) : <Alert className="mt-5"><AlertCircle aria-hidden="true" /><AlertDescription>{copy.noCompatibleDentists}</AlertDescription></Alert>}
          </section>
        )}

        {dentistId && (
          <section className="rounded-2xl border bg-card p-5 sm:p-7" aria-labelledby="availability-heading">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 ref={availabilityHeading} tabIndex={-1} id="availability-heading" className="display-type text-2xl sm:text-3xl">{copy.chooseDate}</h2>
              {date && <Button type="button" variant="ghost" size="sm" onClick={() => { requestVersion.current += 1; setAvailability(undefined); setAvailabilityError(undefined); setRetryAfterSeconds(undefined); setAvailabilityStatus("loading"); setRefreshVersion((value) => value + 1); }}><RefreshCw aria-hidden="true" />{copy.refreshSlots}</Button>}
            </div>
            <label htmlFor="booking-date" className="mt-6 block text-sm font-bold">{copy.date}</label>
            <input id="booking-date" name="date" type="date" min={dateRange.min} max={dateRange.max} value={date} onChange={(event) => chooseDate(event.target.value)} className={cn(fieldClass, "mt-2 max-w-sm")} />
            <div className="mt-6" aria-live="polite" aria-busy={availabilityStatus === "loading"}>
              {submitError === "conflict" && <Alert variant="destructive" className="mb-5"><AlertCircle aria-hidden="true" /><AlertTitle>{copy.conflict}</AlertTitle></Alert>}
              {availabilityStatus === "loading" && <p className="inline-flex min-h-12 items-center gap-3 text-sm text-muted-foreground"><RefreshCw aria-hidden="true" className="size-4 animate-spin" />{copy.loadingSlots}</p>}
              {availabilityStatus === "error" && availabilityError && <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertTitle>{availabilityErrorMessage(availabilityError, copy)}</AlertTitle><AlertDescription>{availabilityError === "rate" && retryAfterSeconds !== undefined && <span className="mt-1 block">{copy.waitSeconds.replace("{seconds}", String(retryAfterSeconds))}</span>}<Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => { requestVersion.current += 1; setAvailability(undefined); setAvailabilityError(undefined); setRetryAfterSeconds(undefined); setAvailabilityStatus("loading"); setRefreshVersion((value) => value + 1); }}>{copy.retrySame}</Button></AlertDescription></Alert>}
              {availabilityStatus === "idle" && availability && availability.slots.length === 0 && <Alert><CalendarDays aria-hidden="true" /><AlertDescription>{reasonMessage(availability.reason, copy)}</AlertDescription></Alert>}
              {availabilityStatus === "idle" && availability && availability.slots.length > 0 && (
                <fieldset>
                  <legend className="text-sm font-bold">{copy.availableTimes}</legend>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                    {availability.slots.map((item) => (
                      <button key={item.startAt} type="button" aria-pressed={slot === item.start} aria-label={copy.selectTime.replace("{time}", item.start)} onClick={() => { setSlot(item.start); setSubmitError(undefined); }} className={cn("min-h-12 rounded-lg border px-3 font-semibold transition-colors hover:border-primary hover:bg-secondary", slot === item.start && "border-primary bg-primary text-primary-foreground hover:bg-primary")}>{item.start}</button>
                    ))}
                  </div>
                </fieldset>
              )}
            </div>
          </section>
        )}

        {slot && (
          <section className="rounded-2xl border bg-card p-5 sm:p-7" aria-labelledby="patient-heading">
            <h2 id="patient-heading" className="display-type text-2xl sm:text-3xl">{copy.patientDetails}</h2>
            <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="text-sm font-bold">{copy.name}<span aria-hidden="true"> *</span><input className={cn(fieldClass, "mt-2")} name="patientName" autoComplete="name" minLength={2} maxLength={120} required value={patientName} onChange={(event) => setPatientName(event.target.value)} /></label>
                <label className="text-sm font-bold">{copy.phone}<span aria-hidden="true"> *</span><input className={cn(fieldClass, "mt-2")} name="patientPhone" type="tel" autoComplete="tel" inputMode="tel" minLength={8} maxLength={30} required value={patientPhone} onChange={(event) => setPatientPhone(event.target.value)} /></label>
              </div>
              <label className="block text-sm font-bold">{clinic.requireEmail ? copy.email : copy.emailOptional}{clinic.requireEmail && <span aria-hidden="true"> *</span>}<input className={cn(fieldClass, "mt-2")} name="patientEmail" type="email" autoComplete="email" maxLength={254} required={clinic.requireEmail} value={patientEmail} onChange={(event) => setPatientEmail(event.target.value)} /></label>
              <label className="block text-sm font-bold">{copy.comment}<textarea className={cn(fieldClass, "mt-2 min-h-28 py-3")} name="patientComment" maxLength={1000} value={patientComment} onChange={(event) => setPatientComment(event.target.value)} aria-describedby="comment-hint" /><span id="comment-hint" className="mt-2 flex justify-between gap-4 text-xs font-normal text-muted-foreground"><span>{copy.commentHint}</span><span>{copy.charactersLeft.replace("{count}", String(1000 - patientComment.length))}</span></span></label>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-4 text-sm leading-6"><input type="checkbox" className="mt-1 size-5 shrink-0 accent-primary" required checked={privacyAccepted} onChange={(event) => setPrivacyAccepted(event.target.checked)} /><span>{copy.privacy}</span></label>
              <BookingChallenge provider={challenge.provider} siteKey={challenge.siteKey} locale={locale} label={copy.challenge} loadingLabel={copy.challengeLoading} errorLabel={copy.challengeError} resetVersion={challengeVersion} onToken={handleChallengeToken} onError={handleChallengeError} />
              {challengeFailed && <Alert variant="destructive"><ShieldCheck aria-hidden="true" /><AlertDescription>{copy.challengeError}</AlertDescription></Alert>}
              {submitError && submitError !== "conflict" && submitError !== "not-found" && <Alert ref={submitErrorAlert} tabIndex={-1} variant="destructive"><AlertCircle aria-hidden="true" /><AlertTitle>{submitErrorMessage(submitError, copy)}</AlertTitle>{(submitError === "uncertain" || (submitError === "rate" && retryAfterSeconds !== undefined)) && <AlertDescription><span className="mt-2 block">{submitError === "rate" ? copy.waitSeconds.replace("{seconds}", String(retryAfterSeconds)) : copy.retrySame}</span></AlertDescription>}</Alert>}
              <Button type="submit" size="lg" disabled={submitting || (challenge.provider === "turnstile" && !challengeToken)} className="w-full sm:w-auto">
                {submitting ? <><RefreshCw aria-hidden="true" className="animate-spin" />{copy.submitting}</> : <>{copy.submit}<ArrowRight aria-hidden="true" /></>}
              </Button>
            </form>
          </section>
        )}
      </div>

      <aside className="rounded-2xl border bg-card p-5 lg:sticky lg:top-28" aria-label={copy.review}>
        <h2 className="font-bold">{copy.review}</h2>
        <ol className="mt-5 space-y-4">
          {[
            [copy.stepService, selectedService?.name.text],
            [copy.stepDentist, selectedDentist?.fullName],
            [copy.stepTime, date && slot ? `${formatBookingDate(date, locale, clinic.timezone)} · ${slot}` : undefined],
            [copy.stepDetails, completedSteps >= 3 ? copy.required : undefined],
          ].map(([label, value], index) => (
            <li key={label} className="grid grid-cols-[2rem_1fr] gap-3">
              <span aria-hidden="true" className={cn("grid size-8 place-items-center rounded-full border text-xs font-bold", index < completedSteps ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground")}>{index < completedSteps ? <Check className="size-4" /> : index + 1}</span>
              <span><span className="block text-sm font-semibold">{label}</span>{value && <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{value}</span>}</span>
            </li>
          ))}
        </ol>
        <p className="mt-6 flex gap-2 border-t pt-5 text-xs leading-5 text-muted-foreground"><Clock3 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{copy.intro}</p>
      </aside>
    </div>
  );
}
