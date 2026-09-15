"use client";

import { Archive, ImagePlus, Pencil, RefreshCw, RotateCcw, Trash2, Upload, UserRound, Wrench } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { StaffApiError } from "@/api/staff-client";
import type { StaffDentist, StaffService } from "@/api/staff-management";
import {
  validateMediaFile,
  type GalleryTranslations,
  type MediaCleanupStatus,
  type StaffGalleryImage,
  type StaffMediaCleanupJob,
} from "@/api/staff-media";
import { useStaffAuth } from "@/components/staff/staff-auth-provider";
import {
  ConfirmActionDialog,
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

type MediaTab = "gallery" | "dentists" | "services" | "cleanup";

function cleanupStatusLabel(status: MediaCleanupStatus, copy: ReturnType<typeof useMediaCopy>) {
  return {
    held: copy.cleanupHeld,
    pending: copy.cleanupPending,
    processing: copy.cleanupProcessing,
    completed: copy.cleanupCompleted,
    failed: copy.cleanupFailed,
    cancelled: copy.cleanupCancelled,
  }[status];
}

function cleanupReasonLabel(reason: StaffMediaCleanupJob["reason"], copy: ReturnType<typeof useMediaCopy>) {
  return {
    replacement: copy.cleanupReplacement,
    removal: copy.cleanupRemoval,
    rollback: copy.cleanupRollback,
    consent_purge: copy.cleanupConsentPurge,
    reconciliation: copy.cleanupReconciliation,
  }[reason];
}

function cleanupSourceLabel(source: string, copy: ReturnType<typeof useMediaCopy>) {
  return {
    dentist: copy.cleanupDentist,
    service: copy.cleanupService,
    gallery: copy.cleanupGallery,
    before_after: copy.cleanupBeforeAfter,
  }[source] ?? "—";
}
type ImageTarget = { kind: "dentist" | "service"; id: string; label: string; asset: StaffDentist["photo"] };

function dentistName(dentist: StaffDentist) {
  return `${dentist.firstName} ${dentist.lastName}`.trim();
}

function serviceName(service: StaffService, locale: Locale) {
  return service.translations[locale]?.name || service.translations.hy?.name || service.name;
}

function GalleryEditor({
  value,
  pending,
  onClose,
  onSubmit,
}: {
  value: StaffGalleryImage | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (payload: { image?: File; translations: GalleryTranslations; sortOrder: number; active: boolean }) => void;
}) {
  const copy = useMediaCopy();
  const [file, setFile] = useState<File | null>(null);
  const [translations, setTranslations] = useState<LocalizedDraft>(() =>
    value ? localizedDraft(value.translations, ["altText", "caption"]) : emptyLocalizedDraft(["altText", "caption"]));
  const [sortOrder, setSortOrder] = useState(value?.sortOrder ?? 0);
  const [active, setActive] = useState(value?.active ?? true);
  const [error, setError] = useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const compact = compactTranslations(translations) as GalleryTranslations;
    const fileProblem = !value ? validateMediaFile(file) : null;
    if (fileProblem) {
      setError(fileProblem === "too-large" ? copy.tooLargeFile : fileProblem === "unsupported" ? copy.unsupportedFile : copy.emptyFile);
      return;
    }
    if (active && !compact.hy?.altText) {
      setError(copy.armenianRequired);
      return;
    }
    setError("");
    onSubmit({ image: file ?? undefined, translations: compact, sortOrder, active });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent closeLabel={copy.cancel} className="w-[min(calc(100%-1.25rem),48rem)]">
        <DialogTitle>{value ? copy.editGalleryTitle : copy.uploadTitle}</DialogTitle>
        <DialogDescription className="mt-2">{copy.galleryIntro}</DialogDescription>
        <form className="mt-6 space-y-5" onSubmit={submit}>
          {!value && <StaffFileField label={copy.imageFile} file={file} onFile={setFile} disabled={pending} />}
          <LocalizedFields
            value={translations}
            onChange={setTranslations}
            disabled={pending}
            primaryRequired={active ? ["altText"] : []}
            fields={[
              { name: "altText", label: copy.altText, maxLength: 200 },
              { name: "caption", label: copy.caption, maxLength: 500, multiline: true },
            ]}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>{copy.displayOrder}<input className={fieldClass} type="number" min={0} max={10_000} value={sortOrder} onChange={(event) => setSortOrder(Number(event.target.value))} disabled={pending} required /></label>
            {!value && <label className="flex min-h-11 items-center gap-3 self-end text-sm font-medium"><input className="size-4" type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} disabled={pending} />{copy.publishNow}</label>}
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>{copy.cancel}</Button>
            <Button type="submit" disabled={pending}>{value ? <Pencil aria-hidden="true" /> : <Upload aria-hidden="true" />}{pending ? copy.saving : value ? copy.save : copy.upload}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ImageEditor({ target, pending, onClose, onSubmit }: {
  target: ImageTarget;
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
    if (problem || !file) {
      setError(problem === "too-large" ? copy.tooLargeFile : problem === "unsupported" ? copy.unsupportedFile : copy.emptyFile);
      return;
    }
    setError("");
    onSubmit(file);
  }
  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent closeLabel={copy.cancel}>
        <DialogTitle>{target.asset ? copy.replaceImage : copy.uploadPhoto}: {target.label}</DialogTitle>
        <DialogDescription className="mt-2">{target.kind === "dentist" ? copy.dentistMediaIntro : copy.serviceMediaIntro}</DialogDescription>
        <form className="mt-6 space-y-5" onSubmit={submit}>
          <StaffFileField label={copy.imageFile} file={file} onFile={setFile} disabled={pending} />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>{copy.cancel}</Button>
            <Button type="submit" disabled={pending}><Upload aria-hidden="true" />{pending ? copy.uploading : copy.upload}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GalleryGrid({ items, locale, pending, onEdit, onArchive, onRestore }: {
  items: StaffGalleryImage[];
  locale: Locale;
  pending: boolean;
  onEdit: (item: StaffGalleryImage) => void;
  onArchive: (item: StaffGalleryImage) => void;
  onRestore: (item: StaffGalleryImage) => void;
}) {
  const copy = useMediaCopy();
  if (items.length === 0) return <p className="mt-7 rounded-xl border bg-card p-6 text-muted-foreground">{copy.noGallery}</p>;
  const priorityIndex = firstAvailableMediaIndex(items.map((item) => item.image));
  return <div className="mt-7 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{items.map((item, index) => {
    const alt = item.translations[locale]?.altText || item.translations.hy?.altText || item.altText;
    const caption = item.translations[locale]?.caption || item.translations.hy?.caption || item.caption;
    return <article key={item.id} className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm">
      <ManagedMediaPreview asset={item.image} alt={alt} className="aspect-[4/3]" priority={index === priorityIndex} />
      <div className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="min-w-0 break-words font-semibold">{alt || "—"}</h3><MediaStatusBadge label={item.active ? copy.published : copy.archived} tone={item.active ? "safe" : "muted"} /></div>
        {caption && <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{caption}</p>}
        <p className="mt-3 text-xs text-muted-foreground">{copy.displayOrder}: {item.sortOrder}</p>
        <div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => onEdit(item)} disabled={pending}><Pencil aria-hidden="true" />{copy.edit}</Button>{item.active ? <Button variant="destructive" size="sm" onClick={() => onArchive(item)} disabled={pending}><Archive aria-hidden="true" />{copy.archive}</Button> : <Button variant="secondary" size="sm" onClick={() => onRestore(item)} disabled={pending}><RotateCcw aria-hidden="true" />{copy.restore}</Button>}</div>
      </div>
    </article>;
  })}</div>;
}

function EntityMediaGrid({ kind, items, locale, pending, onEdit, onRemove }: {
  kind: "dentist" | "service";
  items: Array<StaffDentist | StaffService>;
  locale: Locale;
  pending: boolean;
  onEdit: (target: ImageTarget) => void;
  onRemove: (target: ImageTarget) => void;
}) {
  const copy = useMediaCopy();
  if (items.length === 0) return <p className="mt-7 rounded-xl border bg-card p-6 text-muted-foreground">{kind === "dentist" ? copy.noDentists : copy.noServices}</p>;
  const priorityIndex = firstAvailableMediaIndex(items.map((item) => kind === "dentist" ? (item as StaffDentist).photo : (item as StaffService).image));
  return <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{items.map((item, index) => {
    const isDentist = kind === "dentist";
    const label = isDentist ? dentistName(item as StaffDentist) : serviceName(item as StaffService, locale);
    const asset = isDentist ? (item as StaffDentist).photo : (item as StaffService).image;
    const target: ImageTarget = { kind, id: item._id, label, asset };
    return <article key={item._id} className="min-w-0 rounded-xl border bg-card p-4 shadow-sm">
      <ManagedMediaPreview asset={asset} alt={label} className="aspect-[4/3] rounded-lg" priority={index === priorityIndex} />
      <div className="mt-4 flex items-start gap-3">{isDentist ? <UserRound aria-hidden="true" className="mt-1 size-4 shrink-0" /> : <Wrench aria-hidden="true" className="mt-1 size-4 shrink-0" />}<div className="min-w-0"><h3 className="break-words font-semibold">{label}</h3><p className="mt-1 text-xs text-muted-foreground">{asset ? copy.published : copy.noManagedImage}</p></div></div>
      <div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => onEdit(target)} disabled={pending}><ImagePlus aria-hidden="true" />{asset ? copy.replaceImage : copy.uploadPhoto}</Button>{asset && <Button variant="destructive" size="sm" onClick={() => onRemove(target)} disabled={pending}><Trash2 aria-hidden="true" />{copy.removeImage}</Button>}</div>
    </article>;
  })}</div>;
}

function CleanupList({ jobs, pending, onRetry }: { jobs: StaffMediaCleanupJob[]; pending: boolean; onRetry: (job: StaffMediaCleanupJob) => void }) {
  const copy = useMediaCopy();
  if (jobs.length === 0) return <p className="mt-7 rounded-xl border bg-card p-6 text-muted-foreground">{copy.noCleanup}</p>;
  return <div className="mt-7 space-y-3">{jobs.map((job) => <article key={job.id} className="rounded-xl border bg-card p-4 shadow-sm">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><MediaStatusBadge label={cleanupStatusLabel(job.status, copy)} tone={job.status === "failed" ? "danger" : job.status === "pending" || job.status === "held" ? "warning" : job.status === "completed" ? "safe" : "muted"} /><dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">{copy.cleanupReason}</dt><dd>{cleanupReasonLabel(job.reason, copy)}</dd></div><div><dt className="text-muted-foreground">{copy.cleanupSource}</dt><dd>{cleanupSourceLabel(job.sourceType, copy)}</dd></div><div><dt className="text-muted-foreground">{copy.cleanupAttempts}</dt><dd>{job.attempts} / {job.maxAttempts}</dd></div><div><dt className="text-muted-foreground">{copy.cleanupError}</dt><dd className="break-all">{job.lastErrorCode || "—"}</dd></div></dl></div>{(job.status === "failed" || job.status === "pending") && <Button variant="outline" size="sm" onClick={() => onRetry(job)} disabled={pending}><RefreshCw aria-hidden="true" />{copy.retryCleanup}</Button>}</div>
  </article>)}</div>;
}

function StaffMediaContent() {
  const { api, handleApiError, locale } = useStaffAuth();
  const copy = useMediaCopy();
  const [tab, setTab] = useState<MediaTab>("gallery");
  const [gallery, setGallery] = useState<StaffGalleryImage[]>([]);
  const [dentists, setDentists] = useState<StaffDentist[]>([]);
  const [services, setServices] = useState<StaffService[]>([]);
  const [cleanup, setCleanup] = useState<StaffMediaCleanupJob[]>([]);
  const [cleanupStatus, setCleanupStatus] = useState<MediaCleanupStatus | "">("");
  const [cleanupPage, setCleanupPage] = useState(1);
  const [cleanupPages, setCleanupPages] = useState(0);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<ManagementFeedbackValue | null>(null);
  const [galleryEditor, setGalleryEditor] = useState<{ open: boolean; value: StaffGalleryImage | null }>({ open: false, value: null });
  const [archiveTarget, setArchiveTarget] = useState<StaffGalleryImage | null>(null);
  const [imageTarget, setImageTarget] = useState<ImageTarget | null>(null);
  const [removeTarget, setRemoveTarget] = useState<ImageTarget | null>(null);

  const loadCore = useCallback(async (signal?: AbortSignal, report = true) => {
    if (report) { setLoading(true); setFeedback(null); }
    try {
      const [nextGallery, nextDentists, nextServices] = await Promise.all([
        api.listGallery(signal), api.listDentists(signal), api.listServices(signal),
      ]);
      setGallery(nextGallery); setDentists(nextDentists); setServices(nextServices);
    } catch (error) {
      if (error instanceof StaffApiError && error.kind === "cancelled") return;
      handleApiError(error);
      if (report) setFeedback({ ...mediaFeedback(error, copy), message: copy.loadError });
      throw error;
    } finally { if (report && !signal?.aborted) setLoading(false); }
  }, [api, copy, handleApiError]);

  const loadCleanup = useCallback(async (requestedPage = cleanupPage, status = cleanupStatus, signal?: AbortSignal) => {
    setCleanupLoading(true);
    try {
      const result = await api.listMediaCleanupJobs({ page: requestedPage, status: status || undefined }, signal);
      setCleanup(result.jobs);
      setCleanupPage(result.pagination.page);
      setCleanupPages(result.pagination.pages);
    } catch (error) {
      if (error instanceof StaffApiError && error.kind === "cancelled") return;
      handleApiError(error); setFeedback({ ...mediaFeedback(error, copy), message: copy.loadError });
      throw error;
    } finally {
      if (!signal?.aborted) setCleanupLoading(false);
    }
  }, [api, cleanupPage, cleanupStatus, copy, handleApiError]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) void loadCore(controller.signal).catch(() => undefined); });
    return () => controller.abort();
  }, [loadCore]);

  useEffect(() => {
    if (tab !== "cleanup") return;
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) void loadCleanup(cleanupPage, cleanupStatus, controller.signal).catch(() => undefined); });
    return () => controller.abort();
  }, [cleanupPage, cleanupStatus, loadCleanup, tab]);

  async function mutate(operation: () => Promise<unknown>, options: { close: () => void; upload?: boolean; cleanupOnly?: boolean }) {
    if (pending) return;
    setPending(true); setFeedback(null);
    try {
      await operation();
      if (options.cleanupOnly) await loadCleanup(cleanupPage, cleanupStatus);
      else await loadCore(undefined, false);
      options.close();
      setFeedback({ kind: "success", message: copy.authoritativeSaved });
    } catch (error) {
      handleApiError(error);
      if (options.cleanupOnly) await loadCleanup(cleanupPage, cleanupStatus).catch(() => undefined);
      else await loadCore(undefined, false).catch(() => undefined);
      setFeedback(mediaFeedback(error, copy, { uncertainMutation: options.upload }));
    } finally { setPending(false); }
  }

  const tabs: Array<{ id: MediaTab; label: string }> = [
    { id: "gallery", label: copy.galleryTab }, { id: "dentists", label: copy.dentistsTab },
    { id: "services", label: copy.servicesTab }, { id: "cleanup", label: copy.cleanupTab },
  ];
  return <section className="max-w-7xl">
    <ManagementHeader eyebrow={copy.mediaNav} title={copy.mediaTitle} intro={copy.mediaIntro} action={tab === "gallery" ? <Button onClick={() => setGalleryEditor({ open: true, value: null })} disabled={loading}><ImagePlus aria-hidden="true" />{copy.addGallery}</Button> : undefined} />
    <ManagementFeedback value={feedback} onRetry={() => void loadCore().catch(() => undefined)} />
    <div role="tablist" aria-label={copy.mediaTitle} className="mt-7 flex gap-2 overflow-x-auto pb-2">{tabs.map((item) => <Button key={item.id} role="tab" aria-selected={tab === item.id} variant={tab === item.id ? "secondary" : "outline"} onClick={() => setTab(item.id)}>{item.label}</Button>)}</div>
    {loading ? <p role="status" className="mt-8 text-sm text-muted-foreground">{copy.loading}</p> : <>
      {tab === "gallery" && <><h2 className="sr-only">{copy.galleryTitle}</h2><GalleryGrid items={gallery} locale={locale} pending={pending} onEdit={(value) => setGalleryEditor({ open: true, value })} onArchive={setArchiveTarget} onRestore={(item) => void mutate(() => api.restoreGalleryImage(item.id), { close: () => undefined })} /></>}
      {tab === "dentists" && <><h2 className="sr-only">{copy.dentistMediaTitle}</h2><EntityMediaGrid kind="dentist" items={dentists} locale={locale} pending={pending} onEdit={setImageTarget} onRemove={setRemoveTarget} /></>}
      {tab === "services" && <><h2 className="sr-only">{copy.serviceMediaTitle}</h2><EntityMediaGrid kind="service" items={services} locale={locale} pending={pending} onEdit={setImageTarget} onRemove={setRemoveTarget} /></>}
      {tab === "cleanup" && <div className="mt-7"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-2xl font-semibold">{copy.cleanupTitle}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{copy.cleanupIntro}</p></div><label className={labelClass}>{copy.cleanupStatus}<select className={`${fieldClass} min-w-48`} value={cleanupStatus} onChange={(event) => { setCleanupStatus(event.target.value as MediaCleanupStatus | ""); setCleanupPage(1); }}><option value="">{copy.allStatuses}</option>{(["held", "pending", "processing", "completed", "failed", "cancelled"] as MediaCleanupStatus[]).map((status) => <option key={status} value={status}>{cleanupStatusLabel(status, copy)}</option>)}</select></label></div>{cleanupLoading ? <p role="status" className="mt-7 text-sm text-muted-foreground">{copy.loading}</p> : <><CleanupList jobs={cleanup} pending={pending} onRetry={(job) => void mutate(() => api.retryMediaCleanupJob(job.id), { close: () => undefined, cleanupOnly: true })} />{cleanupPages > 1 && <nav aria-label={copy.page} className="mt-7 flex items-center justify-center gap-3"><Button variant="outline" disabled={pending || cleanupPage <= 1} onClick={() => setCleanupPage((value) => value - 1)}>{copy.previous}</Button><span className="text-sm">{copy.page} {cleanupPage} / {cleanupPages}</span><Button variant="outline" disabled={pending || cleanupPage >= cleanupPages} onClick={() => setCleanupPage((value) => value + 1)}>{copy.next}</Button></nav>}</>}</div>}
    </>}
    {galleryEditor.open && <GalleryEditor value={galleryEditor.value} pending={pending} onClose={() => setGalleryEditor({ open: false, value: null })} onSubmit={(payload) => void mutate(() => galleryEditor.value ? api.updateGalleryImage(galleryEditor.value.id, { translations: payload.translations, sortOrder: payload.sortOrder }) : api.createGalleryImage({ image: payload.image!, translations: payload.translations, sortOrder: payload.sortOrder, active: payload.active }), { close: () => setGalleryEditor({ open: false, value: null }), upload: !galleryEditor.value })} />}
    <ConfirmActionDialog open={Boolean(archiveTarget)} onOpenChange={(open) => !open && setArchiveTarget(null)} title={copy.archiveGalleryTitle} body={copy.archiveGalleryBody} confirmLabel={copy.confirmArchive} pending={pending} onConfirm={() => archiveTarget && void mutate(() => api.disableGalleryImage(archiveTarget.id), { close: () => setArchiveTarget(null) })} />
    {imageTarget && <ImageEditor target={imageTarget} pending={pending} onClose={() => setImageTarget(null)} onSubmit={(file) => void mutate(() => imageTarget.kind === "dentist" ? api.replaceDentistPhoto(imageTarget.id, file) : api.replaceServiceImage(imageTarget.id, file), { close: () => setImageTarget(null), upload: true })} />}
    <ConfirmActionDialog open={Boolean(removeTarget)} onOpenChange={(open) => !open && setRemoveTarget(null)} title={copy.removeTitle} body={copy.removeBody} confirmLabel={copy.confirmRemove} pending={pending} onConfirm={() => removeTarget && void mutate(() => removeTarget.kind === "dentist" ? api.removeDentistPhoto(removeTarget.id) : api.removeServiceImage(removeTarget.id), { close: () => setRemoveTarget(null) })} />
  </section>;
}

export function StaffMediaManagement() {
  const { user } = useStaffAuth();
  if (user?.role !== "admin") return <StaffAccessDenied />;
  return <StaffMediaContent />;
}
