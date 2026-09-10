"use client";

import { Archive, FolderTree, Pencil, Plus, RotateCcw, Stethoscope } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StaffApiError } from "@/api/staff-client";
import type {
  CreateCategoryPayload,
  CreateServicePayload,
  PriceType,
  StaffCategory,
  StaffService,
  UpdateCategoryPayload,
  UpdateServicePayload,
} from "@/api/staff-management";
import { useStaffAuth } from "@/components/staff/staff-auth-provider";
import { StaffAccessDenied } from "@/components/staff/staff-shell";
import {
  compactTranslations,
  ConfirmActionDialog,
  fieldClass,
  labelClass,
  LocalizedFields,
  localizedDraft,
  ManagementFeedback,
  ManagementHeader,
  managementFeedback,
  StatusBadge,
  useManagementCopy,
  type LocalizedDraft,
  type ManagementFeedbackValue,
} from "@/components/staff/staff-management-shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { Locale } from "@/i18n/locales";

function localizedName(
  entity: Pick<StaffCategory | StaffService, "name" | "translations">,
  locale: Locale,
) {
  return entity.translations[locale]?.name || entity.translations.hy?.name || entity.name;
}

function numberInput(value: FormDataEntryValue | null) {
  const result = Number(String(value ?? ""));
  return Number.isFinite(result) ? result : Number.NaN;
}

function CategoryDialog({ value, open, pending, onOpenChange, onSubmit }: {
  value: StaffCategory | null;
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: CreateCategoryPayload | UpdateCategoryPayload) => Promise<void>;
}) {
  const copy = useManagementCopy();
  const [translations, setTranslations] = useState<LocalizedDraft>(() => localizedDraft(value?.translations, ["name", "description"]));
  const [active, setActive] = useState(value?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    const sortOrder = numberInput(data.get("sortOrder"));
    const compact = compactTranslations(translations) as CreateCategoryPayload["translations"];
    if ((active && (translations.hy.name.trim().length < 2)) ||
        !Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 10_000) {
      setError(copy.validationError);
      return;
    }
    setError(null);
    await onSubmit(value
      ? { translations: compact, sortOrder }
      : { translations: compact, sortOrder, isActive: active });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent closeLabel={copy.cancel}>
        <DialogTitle>{value ? copy.editCategory : copy.addCategory}</DialogTitle>
        <DialogDescription className="mt-2">{copy.generatedSlug}</DialogDescription>
        {error && <Alert variant="destructive" className="mt-4"><AlertDescription>{error}</AlertDescription></Alert>}
        <form onSubmit={submit} className="mt-5 space-y-5" noValidate>
          <LocalizedFields
            value={translations}
            onChange={setTranslations}
            disabled={pending}
            primaryRequired={active ? ["name"] : []}
            fields={[
              { name: "name", label: copy.categoryName, maxLength: 100 },
              { name: "description", label: copy.description, maxLength: 500, multiline: true },
            ]}
          />
          <label className={labelClass}>{copy.sortOrder}
            <input className={fieldClass} name="sortOrder" type="number" min={0} max={10_000} step={1} defaultValue={value?.sortOrder ?? 0} disabled={pending} required />
          </label>
          {!value && (
            <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
              <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} disabled={pending} className="size-4" />
              {copy.publishNow}
            </label>
          )}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>{copy.cancel}</Button>
            <Button type="submit" disabled={pending}>{pending ? copy.saving : value ? copy.save : copy.create}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ServiceDialog({ value, categories, open, pending, onOpenChange, onSubmit }: {
  value: StaffService | null;
  categories: StaffCategory[];
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: CreateServicePayload | UpdateServicePayload) => Promise<void>;
}) {
  const copy = useManagementCopy();
  const [translations, setTranslations] = useState<LocalizedDraft>(() => localizedDraft(value?.translations, ["name", "shortDescription", "description"]));
  const [active, setActive] = useState(value?.isActive ?? true);
  const [priceType, setPriceType] = useState<PriceType>(value?.priceType ?? "on_request");
  const [error, setError] = useState<string | null>(null);
  const availableCategories = useMemo(() => categories.filter((category) => category.isActive || category._id === value?.category._id), [categories, value]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    const category = String(data.get("category") || "");
    const sortOrder = numberInput(data.get("sortOrder"));
    const durationMinutes = numberInput(data.get("durationMinutes"));
    const priceFrom = data.get("priceFrom") === "" ? null : numberInput(data.get("priceFrom"));
    const priceTo = data.get("priceTo") === "" ? null : numberInput(data.get("priceTo"));
    const pricingInvalid =
      ((priceType === "fixed" || priceType === "from") && (priceFrom === null || priceFrom < 0)) ||
      (priceType === "range" && (priceFrom === null || priceTo === null || priceFrom < 0 || priceTo < priceFrom));
    if ((active && translations.hy.name.trim().length < 2) || !availableCategories.some((item) => item._id === category) ||
        !Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 480 ||
        !Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 10_000 || pricingInvalid) {
      setError(copy.validationError);
      return;
    }
    const common: UpdateServicePayload = {
      translations: compactTranslations(translations) as CreateServicePayload["translations"],
      category,
      priceType,
      priceFrom: priceType === "on_request" ? null : priceFrom,
      priceTo: priceType === "range" ? priceTo : null,
      durationMinutes,
      isFeatured: data.get("isFeatured") === "on",
      bookingEnabled: data.get("bookingEnabled") === "on",
      sortOrder,
    };
    if (value?.category._id === category) delete common.category;
    setError(null);
    await onSubmit(value ? common : { ...common, category, isActive: active } as CreateServicePayload);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent closeLabel={copy.cancel} className="w-[min(calc(100%-2rem),48rem)]">
        <DialogTitle>{value ? copy.editService : copy.addService}</DialogTitle>
        <DialogDescription className="mt-2">{copy.generatedSlug}</DialogDescription>
        {error && <Alert variant="destructive" className="mt-4"><AlertDescription>{error}</AlertDescription></Alert>}
        <form onSubmit={submit} className="mt-5 space-y-5" noValidate>
          <LocalizedFields
            value={translations}
            onChange={setTranslations}
            disabled={pending}
            primaryRequired={active ? ["name"] : []}
            fields={[
              { name: "name", label: copy.serviceName, maxLength: 150 },
              { name: "shortDescription", label: copy.shortDescription, maxLength: 300, multiline: true },
              { name: "description", label: copy.description, maxLength: 5_000, multiline: true },
            ]}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>{copy.category}
              <select className={fieldClass} name="category" defaultValue={value?.category._id ?? ""} disabled={pending} required>
                <option value="" disabled>{copy.category}</option>
                {availableCategories.map((category) => <option key={category._id} value={category._id}>{category.name}{category.isActive ? "" : ` — ${copy.inactive}`}</option>)}
              </select>
            </label>
            <label className={labelClass}>{copy.duration}
              <input className={fieldClass} name="durationMinutes" type="number" min={15} max={480} step={1} defaultValue={value?.durationMinutes ?? 60} disabled={pending} required />
            </label>
            <label className={labelClass}>{copy.priceType}
              <select className={fieldClass} name="priceType" value={priceType} onChange={(event) => setPriceType(event.target.value as PriceType)} disabled={pending}>
                <option value="fixed">{copy.priceFixed}</option><option value="from">{copy.priceFromType}</option>
                <option value="range">{copy.priceRange}</option><option value="on_request">{copy.priceOnRequest}</option>
              </select>
            </label>
            <label className={labelClass}>{copy.sortOrder}
              <input className={fieldClass} name="sortOrder" type="number" min={0} max={10_000} step={1} defaultValue={value?.sortOrder ?? 0} disabled={pending} required />
            </label>
            {priceType !== "on_request" && <label className={labelClass}>{copy.priceFrom}
              <input className={fieldClass} name="priceFrom" type="number" min={0} step="any" defaultValue={value?.priceFrom ?? ""} disabled={pending} required />
            </label>}
            {priceType === "range" && <label className={labelClass}>{copy.priceTo}
              <input className={fieldClass} name="priceTo" type="number" min={0} step="any" defaultValue={value?.priceTo ?? ""} disabled={pending} required />
            </label>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex min-h-11 items-center gap-3 text-sm font-medium"><input className="size-4" name="bookingEnabled" type="checkbox" defaultChecked={value?.bookingEnabled ?? true} disabled={pending} />{copy.bookingEnabled}</label>
            <label className="flex min-h-11 items-center gap-3 text-sm font-medium"><input className="size-4" name="isFeatured" type="checkbox" defaultChecked={value?.isFeatured ?? false} disabled={pending} />{copy.featured}</label>
            {!value && <label className="flex min-h-11 items-center gap-3 text-sm font-medium"><input className="size-4" type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} disabled={pending} />{copy.publishNow}</label>}
          </div>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>{copy.cancel}</Button>
            <Button type="submit" disabled={pending}>{pending ? copy.saving : value ? copy.save : copy.create}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CatalogAdminContent() {
  const { locale, api, handleApiError } = useStaffAuth();
  const copy = useManagementCopy();
  const [view, setView] = useState<"categories" | "services">("categories");
  const [categories, setCategories] = useState<StaffCategory[]>([]);
  const [services, setServices] = useState<StaffService[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<ManagementFeedbackValue | null>(null);
  const [categoryEditor, setCategoryEditor] = useState<{ open: boolean; value: StaffCategory | null }>({ open: false, value: null });
  const [serviceEditor, setServiceEditor] = useState<{ open: boolean; value: StaffService | null }>({ open: false, value: null });
  const [archiveTarget, setArchiveTarget] = useState<{ kind: "category" | "service"; value: StaffCategory | StaffService } | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setFeedback(null);
    try {
      const [nextCategories, nextServices] = await Promise.all([
        api.listCategories(signal), api.listServices(signal),
      ]);
      setCategories(nextCategories);
      setServices(nextServices);
    } catch (error) {
      if (error instanceof StaffApiError && error.kind === "cancelled") return;
      handleApiError(error);
      setFeedback({ ...managementFeedback(error, copy), message: copy.loadError });
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [api, copy, handleApiError]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) void load(controller.signal); });
    return () => controller.abort();
  }, [load]);

  async function mutate(operation: () => Promise<void>, close: () => void) {
    if (pending) return;
    setPending(true);
    setFeedback(null);
    try {
      await operation();
      await load();
      close();
      setFeedback({ kind: "success", message: copy.saved });
    } catch (error) {
      handleApiError(error);
      const value = managementFeedback(error, copy);
      setFeedback(error instanceof StaffApiError && error.status === 409
        ? { ...value, message: archiveTarget?.kind === "category" ? copy.categoryConflict : copy.relationUnavailable }
        : value);
    } finally {
      setPending(false);
    }
  }

  const priceLabels: Record<PriceType, string> = {
    fixed: copy.priceFixed, from: copy.priceFromType, range: copy.priceRange, on_request: copy.priceOnRequest,
  };

  return (
    <section className="max-w-7xl">
      <ManagementHeader
        eyebrow={copy.catalogNav}
        title={copy.catalogTitle}
        intro={copy.catalogIntro}
        action={<Button onClick={() => view === "categories" ? setCategoryEditor({ open: true, value: null }) : setServiceEditor({ open: true, value: null })} disabled={loading}>
          <Plus aria-hidden="true" />{view === "categories" ? copy.addCategory : copy.addService}
        </Button>}
      />
      <ManagementFeedback value={feedback} onRetry={() => void load()} />
      <div role="tablist" aria-label={copy.catalogTitle} className="mt-7 inline-flex rounded-xl border bg-card p-1">
        <Button role="tab" aria-selected={view === "categories"} variant={view === "categories" ? "secondary" : "ghost"} onClick={() => setView("categories")}><FolderTree aria-hidden="true" />{copy.categories}</Button>
        <Button role="tab" aria-selected={view === "services"} variant={view === "services" ? "secondary" : "ghost"} onClick={() => setView("services")}><Stethoscope aria-hidden="true" />{copy.services}</Button>
      </div>
      {loading ? <p role="status" className="mt-8 text-sm text-muted-foreground">{copy.loading}</p> : view === "categories" ? (
        categories.length === 0 ? <p className="mt-8 rounded-xl border bg-card p-6 text-muted-foreground">{copy.noCategories}</p> :
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {categories.map((category) => (
            <article key={category._id} className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold">{localizedName(category, locale)}</h2><p className="mt-1 text-xs text-muted-foreground">/{category.slug}</p></div><StatusBadge active={category.isActive} copy={copy} /></div>
              <p className="mt-4 line-clamp-3 min-h-6 text-sm leading-6 text-muted-foreground">{category.translations[locale]?.description || category.translations.hy?.description || "—"}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setCategoryEditor({ open: true, value: category })}><Pencil aria-hidden="true" />{copy.edit}</Button>
                {category.isActive ? <Button variant="destructive" size="sm" onClick={() => setArchiveTarget({ kind: "category", value: category })}><Archive aria-hidden="true" />{copy.archive}</Button>
                  : <Button variant="secondary" size="sm" disabled={pending} onClick={() => void mutate(() => api.restoreCategory(category._id), () => undefined)}><RotateCcw aria-hidden="true" />{copy.restore}</Button>}
              </div>
            </article>
          ))}
        </div>
      ) : (
        services.length === 0 ? <p className="mt-8 rounded-xl border bg-card p-6 text-muted-foreground">{copy.noServices}</p> :
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {services.map((service) => (
            <article key={service._id} className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold">{localizedName(service, locale)}</h2><p className="mt-1 text-xs text-muted-foreground">{localizedName(service.category, locale)} · {service.durationMinutes} min</p></div><StatusBadge active={service.isActive} copy={copy} /></div>
              <p className="mt-4 text-sm text-muted-foreground">{priceLabels[service.priceType]}{service.priceFrom !== null ? ` · ${service.priceFrom.toLocaleString()} AMD` : ""}{service.priceTo !== null ? `–${service.priceTo.toLocaleString()} AMD` : ""}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-muted px-2.5 py-1">{service.bookingEnabled ? copy.bookingEnabled : `¬ ${copy.bookingEnabled}`}</span>{service.isFeatured && <span className="rounded-full bg-secondary px-2.5 py-1">{copy.featured}</span>}</div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setServiceEditor({ open: true, value: service })}><Pencil aria-hidden="true" />{copy.edit}</Button>
                {service.isActive ? <Button variant="destructive" size="sm" onClick={() => setArchiveTarget({ kind: "service", value: service })}><Archive aria-hidden="true" />{copy.archive}</Button>
                  : <Button variant="secondary" size="sm" disabled={pending} onClick={() => void mutate(() => api.restoreService(service._id), () => undefined)}><RotateCcw aria-hidden="true" />{copy.restore}</Button>}
              </div>
            </article>
          ))}
        </div>
      )}
      {categoryEditor.open && <CategoryDialog value={categoryEditor.value} open pending={pending} onOpenChange={(open) => setCategoryEditor((current) => ({ ...current, open }))} onSubmit={(payload) => mutate(() => categoryEditor.value ? api.updateCategory(categoryEditor.value._id, payload as UpdateCategoryPayload) : api.createCategory(payload as CreateCategoryPayload), () => setCategoryEditor({ open: false, value: null }))} />}
      {serviceEditor.open && <ServiceDialog value={serviceEditor.value} categories={categories} open pending={pending} onOpenChange={(open) => setServiceEditor((current) => ({ ...current, open }))} onSubmit={(payload) => mutate(() => serviceEditor.value ? api.updateService(serviceEditor.value._id, payload as UpdateServicePayload) : api.createService(payload as CreateServicePayload), () => setServiceEditor({ open: false, value: null }))} />}
      <ConfirmActionDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title={archiveTarget?.kind === "category" ? copy.archiveCategoryTitle : copy.archiveServiceTitle}
        body={archiveTarget?.kind === "category" ? copy.archiveCategoryBody : copy.archiveServiceBody}
        pending={pending}
        onConfirm={() => archiveTarget && void mutate(
          () => archiveTarget.kind === "category" ? api.disableCategory(archiveTarget.value._id) : api.disableService(archiveTarget.value._id),
          () => setArchiveTarget(null),
        )}
      />
    </section>
  );
}

export function StaffCatalogManagement() {
  const { user } = useStaffAuth();
  if (user?.role !== "admin") return <StaffAccessDenied />;
  return <CatalogAdminContent />;
}
