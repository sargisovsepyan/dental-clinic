"use client";

import { Archive, ImagePlus, Pencil, Plus, RotateCcw, ShieldAlert, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { StaffApiError } from "@/api/staff-client";
import type { StaffDentist, StaffService } from "@/api/staff-management";
import {
  validateMediaFile,
  type BeforeAfterTranslations,
  type StaffBeforeAfterCase,
} from "@/api/staff-media";
import { useStaffAuth } from "@/components/staff/staff-auth-provider";
import {
  LocalizedFields,
  ManagementFeedback,
  ManagementHeader,
  compactTranslations,
  emptyLocalizedDraft,
  fieldClass,
  labelClass,
  localizedDraft,
  type LocalizedDraft,
  type ManagementFeedbackValue,
} from "@/components/staff/staff-management-shared";
import { StaffAccessDenied } from "@/components/staff/staff-shell";
import {
  ManagedMediaPreview,
  MediaStatusBadge,
  StaffFileField,
  firstAvailableMediaIndex,
  mediaFeedback,
  useMediaCopy,
} from "@/components/staff/staff-media-shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { Locale } from "@/i18n/locales";

function dentistName(dentist: StaffDentist) {
  return `${dentist.firstName} ${dentist.lastName}`.trim();
}

function serviceName(service: StaffService, locale: Locale) {
  return service.translations[locale]?.name || service.translations.hy?.name || service.name;
}

function caseTitle(item: StaffBeforeAfterCase, locale: Locale) {
  return item.translations[locale]?.title || item.translations.hy?.title || item.title || "—";
}

function consentLabel(item: StaffBeforeAfterCase, copy: ReturnType<typeof useMediaCopy>) {
  if (item.consentStatus === "active") return copy.activeConsent;
  if (item.consentStatus === "unverified") return copy.unverifiedConsent;
  if (item.consentStatus === "withdrawn") return copy.withdrawnConsent;
  return copy.purgedConsent;
}

function consentMethodLabel(method: StaffBeforeAfterCase["consentMethod"], copy: ReturnType<typeof useMediaCopy>) {
  if (!method) return "—";
  return {
    written: copy.written,
    digital: copy.digital,
    verbal: copy.verbal,
    external: copy.external,
    legacy_migrated: copy.legacyMigrated,
    legacy_unverified: copy.legacyUnverified,
  }[method];
}

function publicationLabel(item: StaffBeforeAfterCase, copy: ReturnType<typeof useMediaCopy>) {
  if (item.publicationStatus === "published") return copy.published;
  if (item.publicationStatus === "withdrawn") return copy.withdrawn;
  if (item.publicationStatus === "purged") return copy.purged;
  return copy.draft;
}

function formatDate(value: string | null, locale: Locale) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale === "hy" ? "hy-AM" : locale === "ru" ? "ru-RU" : "en-GB", {
    dateStyle: "medium", timeStyle: "short",
  }).format(new Date(value));
}

function CaseEditor({
  value,
  services,
  dentists,
  locale,
  pending,
  onClose,
  onSubmit,
}: {
  value: StaffBeforeAfterCase | null;
  services: StaffService[];
  dentists: StaffDentist[];
  locale: Locale;
  pending: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    beforeImage?: File;
    afterImage?: File;
    translations: BeforeAfterTranslations;
    serviceId: string;
    dentistId: string;
    consentMethod: "written" | "digital" | "verbal" | "external";
    externalConsentReference?: string;
    active: boolean;
    featured: boolean;
    sortOrder: number;
  }) => void;
}) {
  const copy = useMediaCopy();
  const [beforeFile, setBeforeFile] = useState<File | null>(null);
  const [afterFile, setAfterFile] = useState<File | null>(null);
  const [translations, setTranslations] = useState<LocalizedDraft>(() => value
    ? localizedDraft(value.translations, ["title", "description"])
    : emptyLocalizedDraft(["title", "description"]));
  const [serviceId, setServiceId] = useState(value?.service?.id ?? "");
  const [dentistId, setDentistId] = useState(value?.dentist?.id ?? "");
  const [consentMethod, setConsentMethod] = useState<"written" | "digital" | "verbal" | "external">("written");
  const [externalReference, setExternalReference] = useState("");
  const [consentChecked, setConsentChecked] = useState(false);
  const [active, setActive] = useState(value?.active ?? true);
  const [featured, setFeatured] = useState(value?.featured ?? false);
  const [sortOrder, setSortOrder] = useState(value?.sortOrder ?? 0);
  const [error, setError] = useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const compact = compactTranslations(translations) as BeforeAfterTranslations;
    const beforeProblem = !value ? validateMediaFile(beforeFile) : null;
    const afterProblem = !value ? validateMediaFile(afterFile) : null;
    if (beforeProblem || afterProblem) {
      const problem = beforeProblem || afterProblem;
      setError(problem === "too-large" ? copy.tooLargeFile : problem === "unsupported" ? copy.unsupportedFile : copy.pairRequired); return;
    }
    if (active && !compact.hy?.title) {
      setError(copy.armenianTitleRequired); return;
    }
    if (!value && !consentChecked) {
      setError(copy.consentRequired); return;
    }
    const externalPattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]{2,119}$/;
    if (!value && consentMethod === "external" && !externalPattern.test(externalReference.trim())) {
      setError(copy.externalReferenceRequired); return;
    }
    setError("");
    onSubmit({
      beforeImage: beforeFile ?? undefined,
      afterImage: afterFile ?? undefined,
      translations: compact,
      serviceId,
      dentistId,
      consentMethod,
      externalConsentReference: externalReference.trim() || undefined,
      active,
      featured,
      sortOrder,
    });
  }

  return <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
    <DialogContent closeLabel={copy.cancel} className="w-[min(calc(100%-1.25rem),56rem)]">
      <DialogTitle>{value ? copy.editCase : copy.addCase}</DialogTitle>
      <DialogDescription className="mt-2">{value ? copy.beforeAfterIntro : copy.caseCreated}</DialogDescription>
      <form className="mt-6 space-y-5" onSubmit={submit}>
        {!value && <div className="grid gap-4 md:grid-cols-2"><StaffFileField label={copy.before} file={beforeFile} onFile={setBeforeFile} disabled={pending} /><StaffFileField label={copy.after} file={afterFile} onFile={setAfterFile} disabled={pending} /></div>}
        <LocalizedFields value={translations} onChange={setTranslations} disabled={pending} primaryRequired={active ? ["title"] : []} fields={[
          { name: "title", label: copy.caseTitle, maxLength: 200 },
          { name: "description", label: copy.caseDescription, maxLength: 2_000, multiline: true },
        ]} />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>{copy.service}<select className={fieldClass} value={serviceId} onChange={(event) => setServiceId(event.target.value)} disabled={pending}><option value="">{copy.noRelation}</option>{services.filter((item) => item.isActive).map((item) => <option key={item._id} value={item._id}>{serviceName(item, locale)}</option>)}</select></label>
          <label className={labelClass}>{copy.dentist}<select className={fieldClass} value={dentistId} onChange={(event) => setDentistId(event.target.value)} disabled={pending}><option value="">{copy.noRelation}</option>{dentists.filter((item) => item.isActive).map((item) => <option key={item._id} value={item._id}>{dentistName(item)}</option>)}</select></label>
          <label className={labelClass}>{copy.displayOrder}<input className={fieldClass} type="number" min={0} max={10_000} value={sortOrder} onChange={(event) => setSortOrder(Number(event.target.value))} disabled={pending} required /></label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {!value && <label className="flex min-h-11 items-center gap-3 text-sm font-medium"><input className="size-4" type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} disabled={pending} />{copy.publishNow}</label>}
          <label className="flex min-h-11 items-center gap-3 text-sm font-medium"><input className="size-4" type="checkbox" checked={featured} onChange={(event) => setFeatured(event.target.checked)} disabled={pending} />{copy.featured}</label>
        </div>
        {!value && <fieldset className="rounded-xl border border-primary/25 bg-secondary/30 p-4"><legend className="px-1 font-semibold">{copy.consent}</legend>
          <label className={labelClass}>{copy.consentMethod}<select className={fieldClass} value={consentMethod} onChange={(event) => setConsentMethod(event.target.value as typeof consentMethod)} disabled={pending}><option value="written">{copy.written}</option><option value="digital">{copy.digital}</option><option value="verbal">{copy.verbal}</option><option value="external">{copy.external}</option></select></label>
          {consentMethod === "external" && <label className={`${labelClass} mt-4`}>{copy.consentReference}<input className={fieldClass} value={externalReference} onChange={(event) => setExternalReference(event.target.value)} maxLength={120} disabled={pending} required /><span className="mt-2 block text-xs font-normal text-muted-foreground">{copy.consentReferenceHelp}</span></label>}
          <label className="mt-4 flex items-start gap-3 text-sm leading-6"><input className="mt-1 size-4 shrink-0" type="checkbox" checked={consentChecked} onChange={(event) => setConsentChecked(event.target.checked)} disabled={pending} aria-required="true" />{copy.consentCheckbox}</label>
        </fieldset>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={onClose} disabled={pending}>{copy.cancel}</Button><Button type="submit" disabled={pending}>{value ? <Pencil aria-hidden="true" /> : <Plus aria-hidden="true" />}{pending ? copy.saving : value ? copy.save : copy.createCase}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}

function ReplaceImageDialog({ item, side, locale, pending, onClose, onSubmit }: {
  item: StaffBeforeAfterCase;
  side: "before" | "after";
  locale: Locale;
  pending: boolean;
  onClose: () => void;
  onSubmit: (file: File) => void;
}) {
  const copy = useMediaCopy();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  function submit(event: React.FormEvent) {
    event.preventDefault();
    const problem = validateMediaFile(file);
    if (!file || problem) { setError(problem === "too-large" ? copy.tooLargeFile : problem === "unsupported" ? copy.unsupportedFile : copy.emptyFile); return; }
    setError(""); onSubmit(file);
  }
  return <Dialog open onOpenChange={(open) => !open && !pending && onClose()}><DialogContent closeLabel={copy.cancel}><DialogTitle>{side === "before" ? copy.replaceBefore : copy.replaceAfter}</DialogTitle><DialogDescription className="mt-2">{caseTitle(item, locale)} · {copy.replacementBlocked}</DialogDescription><form className="mt-6 space-y-5" onSubmit={submit}><StaffFileField label={side === "before" ? copy.before : copy.after} file={file} onFile={setFile} disabled={pending} />{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={onClose} disabled={pending}>{copy.cancel}</Button><Button type="submit" disabled={pending}><Upload aria-hidden="true" />{pending ? copy.uploading : copy.upload}</Button></div></form></DialogContent></Dialog>;
}

function ReasonDialog({ kind, pending, onClose, onConfirm }: {
  kind: "withdraw" | "purge";
  pending: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const copy = useMediaCopy();
  const [reason, setReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [phrase, setPhrase] = useState("");
  const valid = reason.trim().length >= 3 && (kind === "withdraw" ? acknowledged : phrase === copy.purgePhrase);
  return <Dialog open onOpenChange={(open) => !open && !pending && onClose()}><DialogContent closeLabel={copy.cancel}><DialogTitle>{kind === "withdraw" ? copy.withdrawTitle : copy.purgeTitle}</DialogTitle><DialogDescription className="mt-3">{kind === "withdraw" ? copy.withdrawBody : copy.purgeBody}</DialogDescription><form className="mt-6 space-y-5" onSubmit={(event) => { event.preventDefault(); if (valid) onConfirm(reason.trim()); }}>
    <label className={labelClass}>{kind === "withdraw" ? copy.withdrawalReason : copy.purgeReason}<textarea className={fieldClass} rows={4} minLength={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} disabled={pending} required /></label>
    {kind === "withdraw" ? <label className="flex items-start gap-3 text-sm leading-6"><input className="mt-1 size-4 shrink-0" type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} disabled={pending} required />{copy.withdrawalAcknowledge}</label> : <label className={labelClass}>{copy.purgePhraseLabel}<code className="mt-2 block break-all rounded-md bg-muted p-3 text-xs">{copy.purgePhrase}</code><input className={fieldClass} value={phrase} onChange={(event) => setPhrase(event.target.value)} autoComplete="off" disabled={pending} required /></label>}
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={onClose} disabled={pending}>{copy.cancel}</Button><Button type="submit" variant="destructive" disabled={pending || !valid}>{pending ? copy.saving : kind === "withdraw" ? copy.confirmWithdrawal : copy.confirmPurge}</Button></div>
  </form></DialogContent></Dialog>;
}

function ArchiveDialog({ pending, onClose, onConfirm }: { pending: boolean; onClose: () => void; onConfirm: () => void }) {
  const copy = useMediaCopy();
  return <Dialog open onOpenChange={(open) => !open && !pending && onClose()}><DialogContent closeLabel={copy.cancel}><DialogTitle>{copy.archiveCaseTitle}</DialogTitle><DialogDescription className="mt-3">{copy.archiveCaseBody}</DialogDescription><div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button variant="outline" onClick={onClose} disabled={pending}>{copy.cancel}</Button><Button variant="destructive" onClick={onConfirm} disabled={pending}>{pending ? copy.saving : copy.archiveCase}</Button></div></DialogContent></Dialog>;
}

function CaseCard({ item, locale, pending, priority, onEdit, onReplace, onArchive, onRestore, onWithdraw, onPurge }: {
  item: StaffBeforeAfterCase;
  locale: Locale;
  pending: boolean;
  priority: boolean;
  onEdit: () => void;
  onReplace: (side: "before" | "after") => void;
  onArchive: () => void;
  onRestore: () => void;
  onWithdraw: () => void;
  onPurge: () => void;
}) {
  const copy = useMediaCopy();
  const consentTone = item.consentStatus === "active" ? "safe" : item.consentStatus === "withdrawn" ? "danger" : "muted";
  const canReplace = item.consentStatus === "active" && Boolean(item.beforeImage && item.afterImage);
  return <article className="overflow-hidden rounded-xl border bg-card shadow-sm">
    <div className="grid grid-cols-2 gap-px bg-border"><div className="min-w-0 bg-card"><p className="p-2 text-center text-xs font-bold uppercase tracking-wide">{copy.before}</p><ManagedMediaPreview asset={item.beforeImage} alt={`${copy.before}: ${caseTitle(item, locale)}`} className="aspect-[4/3]" priority={priority} /></div><div className="min-w-0 bg-card"><p className="p-2 text-center text-xs font-bold uppercase tracking-wide">{copy.after}</p><ManagedMediaPreview asset={item.afterImage} alt={`${copy.after}: ${caseTitle(item, locale)}`} className="aspect-[4/3]" priority={priority} /></div></div>
    <div className="p-4"><h2 className="break-words text-lg font-semibold">{caseTitle(item, locale)}</h2><div className="mt-3 flex flex-wrap gap-2"><MediaStatusBadge label={publicationLabel(item, copy)} tone={item.publicationStatus === "published" ? "safe" : item.publicationStatus === "withdrawn" ? "danger" : "muted"} /><MediaStatusBadge label={consentLabel(item, copy)} tone={consentTone} />{item.featured && <MediaStatusBadge label={copy.featured} tone="warning" />}</div>
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">{copy.service}</dt><dd>{item.service?.label || "—"}</dd></div><div><dt className="text-muted-foreground">{copy.dentist}</dt><dd>{item.dentist?.label || "—"}</dd></div><div><dt className="text-muted-foreground">{copy.consentMethod}</dt><dd>{consentMethodLabel(item.consentMethod, copy)}</dd></div><div><dt className="text-muted-foreground">{copy.consentConfirmed}</dt><dd>{formatDate(item.consentConfirmedAt, locale)}</dd></div><div><dt className="text-muted-foreground">{copy.consentVersion}</dt><dd className="break-all">{item.consentPolicyVersion || "—"}</dd></div>{item.externalConsentReference && <div><dt className="text-muted-foreground">{copy.consentReference}</dt><dd className="break-all font-mono text-xs">{item.externalConsentReference}</dd></div>}</dl>
      {item.withdrawalReason && <p className="mt-3 rounded-lg bg-destructive/8 p-3 text-sm"><strong>{copy.withdrawalReason}:</strong> {item.withdrawalReason}</p>}
      <div className="mt-5 flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={onEdit} disabled={pending}><Pencil aria-hidden="true" />{copy.edit}</Button>{canReplace && <><Button variant="outline" size="sm" onClick={() => onReplace("before")} disabled={pending}><ImagePlus aria-hidden="true" />{copy.before}</Button><Button variant="outline" size="sm" onClick={() => onReplace("after")} disabled={pending}><ImagePlus aria-hidden="true" />{copy.after}</Button></>}{item.consentStatus === "active" && item.active && <Button variant="outline" size="sm" onClick={onArchive} disabled={pending}><Archive aria-hidden="true" />{copy.archiveCase}</Button>}{item.consentStatus === "active" && !item.active && <Button variant="secondary" size="sm" onClick={onRestore} disabled={pending}><RotateCcw aria-hidden="true" />{copy.restoreCase}</Button>}{item.consentStatus === "active" && <Button variant="destructive" size="sm" onClick={onWithdraw} disabled={pending}><ShieldAlert aria-hidden="true" />{copy.withdrawConsent}</Button>}{item.consentStatus === "withdrawn" && <Button variant="destructive" size="sm" onClick={onPurge} disabled={pending}><Trash2 aria-hidden="true" />{copy.purgeMedia}</Button>}</div>
      {(item.consentStatus === "unverified" || item.consentStatus === "withdrawn" || item.consentStatus === "purged") && <p className="mt-3 text-xs text-muted-foreground">{item.consentStatus === "withdrawn" ? copy.restoreBlocked : item.consentStatus === "purged" ? copy.purgeComplete : copy.restoreBlocked}</p>}
    </div>
  </article>;
}

function BeforeAfterContent() {
  const { api, handleApiError, locale } = useStaffAuth();
  const copy = useMediaCopy();
  const [cases, setCases] = useState<StaffBeforeAfterCase[]>([]);
  const [services, setServices] = useState<StaffService[]>([]);
  const [dentists, setDentists] = useState<StaffDentist[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<ManagementFeedbackValue | null>(null);
  const [editor, setEditor] = useState<{ open: boolean; value: StaffBeforeAfterCase | null }>({ open: false, value: null });
  const [replacement, setReplacement] = useState<{ item: StaffBeforeAfterCase; side: "before" | "after" } | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<StaffBeforeAfterCase | null>(null);
  const [reasonTarget, setReasonTarget] = useState<{ item: StaffBeforeAfterCase; kind: "withdraw" | "purge" } | null>(null);

  const load = useCallback(async (requestedPage = page, signal?: AbortSignal, report = true) => {
    if (report) { setLoading(true); setFeedback(null); }
    try {
      const [caseResult, nextServices, nextDentists] = await Promise.all([
        api.listBeforeAfterCases(requestedPage, signal), api.listServices(signal), api.listDentists(signal),
      ]);
      setCases(caseResult.cases); setPages(caseResult.pagination.pages); setPage(caseResult.pagination.page);
      setServices(nextServices); setDentists(nextDentists);
    } catch (error) {
      if (error instanceof StaffApiError && error.kind === "cancelled") return;
      handleApiError(error); if (report) setFeedback({ ...mediaFeedback(error, copy), message: copy.loadError });
      throw error;
    } finally { if (report && !signal?.aborted) setLoading(false); }
  }, [api, copy, handleApiError, page]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) void load(page, controller.signal).catch(() => undefined); });
    return () => controller.abort();
  }, [load, page]);

  async function mutate(operation: () => Promise<unknown>, options: { close: () => void; upload?: boolean; success: string }) {
    if (pending) return;
    setPending(true); setFeedback(null);
    try {
      await operation(); await load(page, undefined, false); options.close();
      setFeedback({ kind: "success", message: options.success });
    } catch (error) {
      handleApiError(error); await load(page, undefined, false).catch(() => undefined);
      setFeedback(mediaFeedback(error, copy, { uncertainMutation: options.upload }));
    } finally { setPending(false); }
  }

  const priorityIndex = firstAvailableMediaIndex(cases.map((item) => item.beforeImage ?? item.afterImage));

  return <section className="max-w-7xl"><ManagementHeader eyebrow={copy.casesNav} title={copy.beforeAfterTitle} intro={copy.beforeAfterIntro} action={<Button onClick={() => setEditor({ open: true, value: null })} disabled={loading}><Plus aria-hidden="true" />{copy.addCase}</Button>} /><ManagementFeedback value={feedback} onRetry={() => void load().catch(() => undefined)} />
    {loading ? <p role="status" className="mt-8 text-sm text-muted-foreground">{copy.loading}</p> : cases.length === 0 ? <p className="mt-7 rounded-xl border bg-card p-6 text-muted-foreground">{copy.noCases}</p> : <div className="mt-7 grid gap-5 xl:grid-cols-2">{cases.map((item, index) => <CaseCard key={item.id} item={item} locale={locale} pending={pending} priority={index === priorityIndex} onEdit={() => setEditor({ open: true, value: item })} onReplace={(side) => setReplacement({ item, side })} onArchive={() => setArchiveTarget(item)} onRestore={() => void mutate(() => api.restoreBeforeAfterCase(item.id), { close: () => undefined, success: copy.caseSaved })} onWithdraw={() => setReasonTarget({ item, kind: "withdraw" })} onPurge={() => setReasonTarget({ item, kind: "purge" })} />)}</div>}
    {pages > 1 && <nav aria-label={copy.page} className="mt-7 flex items-center justify-center gap-3"><Button variant="outline" disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)}>{copy.previous}</Button><span className="text-sm">{copy.page} {page} / {pages}</span><Button variant="outline" disabled={loading || page >= pages} onClick={() => setPage((value) => value + 1)}>{copy.next}</Button></nav>}
    {editor.open && <CaseEditor value={editor.value} services={services} dentists={dentists} locale={locale} pending={pending} onClose={() => setEditor({ open: false, value: null })} onSubmit={(payload) => void mutate(() => editor.value ? api.updateBeforeAfterCase(editor.value.id, { translations: payload.translations, serviceId: payload.serviceId, dentistId: payload.dentistId, featured: payload.featured, sortOrder: payload.sortOrder }) : api.createBeforeAfterCase({ beforeImage: payload.beforeImage!, afterImage: payload.afterImage!, translations: payload.translations, serviceId: payload.serviceId || undefined, dentistId: payload.dentistId || undefined, consentMethod: payload.consentMethod, externalConsentReference: payload.externalConsentReference, active: payload.active, featured: payload.featured, sortOrder: payload.sortOrder }), { close: () => setEditor({ open: false, value: null }), upload: !editor.value, success: editor.value ? copy.caseSaved : copy.caseCreated })} />}
    {replacement && <ReplaceImageDialog item={replacement.item} side={replacement.side} locale={locale} pending={pending} onClose={() => setReplacement(null)} onSubmit={(file) => void mutate(() => api.replaceBeforeAfterImage(replacement.item.id, replacement.side, file), { close: () => setReplacement(null), upload: true, success: copy.caseSaved })} />}
    {archiveTarget && <ArchiveDialog pending={pending} onClose={() => setArchiveTarget(null)} onConfirm={() => void mutate(() => api.disableBeforeAfterCase(archiveTarget.id), { close: () => setArchiveTarget(null), success: copy.caseSaved })} />}
    {reasonTarget && <ReasonDialog kind={reasonTarget.kind} pending={pending} onClose={() => setReasonTarget(null)} onConfirm={(reason) => void mutate(() => reasonTarget.kind === "withdraw" ? api.withdrawBeforeAfterConsent(reasonTarget.item.id, reason) : api.purgeBeforeAfterCase(reasonTarget.item.id, reason), { close: () => setReasonTarget(null), success: reasonTarget.kind === "withdraw" ? copy.withdrawalComplete : copy.purgeComplete })} />}
  </section>;
}

export function StaffBeforeAfterManagement() {
  const { user } = useStaffAuth();
  if (user?.role !== "admin") return <StaffAccessDenied />;
  return <BeforeAfterContent />;
}
