"use client";

import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { useId, useState } from "react";
import { StaffApiError } from "@/api/staff-client";
import { useStaffAuth } from "@/components/staff/staff-auth-provider";
import { StaffAccessDenied } from "@/components/staff/staff-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  staffManagementMessages,
  type StaffManagementMessages,
} from "@/i18n/staff-management-messages";
import { cn } from "@/lib/utils";

export const fieldClass =
  "mt-2 min-h-11 w-full rounded-md border bg-background px-3 py-2 text-base shadow-sm disabled:cursor-not-allowed disabled:bg-muted/50 disabled:text-muted-foreground";
export const compactFieldClass =
  "min-h-10 w-full rounded-md border bg-background px-2.5 py-1.5 text-sm shadow-sm disabled:cursor-not-allowed disabled:bg-muted/50";
export const labelClass = "block text-sm font-medium";

export function useManagementCopy() {
  const { locale } = useStaffAuth();
  return staffManagementMessages[locale];
}

export function StaffAdminBoundary({ children }: { children: React.ReactNode }) {
  const { user } = useStaffAuth();
  return user?.role === "admin" ? children : <StaffAccessDenied />;
}

export function ManagementHeader({ eyebrow, title, intro, action }: {
  eyebrow: string;
  title: string;
  intro: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
      <div>
        <p className="text-xs font-bold tracking-[0.14em] text-primary uppercase">{eyebrow}</p>
        <h1 className="display-type mt-3 text-4xl sm:text-5xl">{title}</h1>
        <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">{intro}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

export function StatusBadge({ active, copy }: { active: boolean; copy: StaffManagementMessages }) {
  return (
    <span className={cn(
      "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
      active ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground",
    )}>
      {active ? copy.active : copy.inactive}
    </span>
  );
}

export type ManagementFeedbackValue = {
  kind: "error" | "success";
  message: string;
  requestId?: string;
};

export function managementFeedback(error: unknown, copy: StaffManagementMessages): ManagementFeedbackValue {
  if (!(error instanceof StaffApiError)) return { kind: "error", message: copy.mutationError };
  if (error.status === 400) return { kind: "error", message: copy.validationError, requestId: error.requestId };
  if (error.status === 403) return { kind: "error", message: copy.loadError, requestId: error.requestId };
  if (error.code === "SCHEDULE_REVISION_CONFLICT") {
    return { kind: "error", message: copy.staleSchedule, requestId: error.requestId };
  }
  if (error.code === "SCHEDULE_CONFLICT_SCAN_LIMIT") {
    return { kind: "error", message: copy.scheduleScanLimit, requestId: error.requestId };
  }
  return { kind: "error", message: copy.mutationError, requestId: error.requestId };
}

export function ManagementFeedback({ value, onRetry }: {
  value: ManagementFeedbackValue | null;
  onRetry?: () => void;
}) {
  const copy = useManagementCopy();
  if (!value) return null;
  return (
    <Alert variant={value.kind === "error" ? "destructive" : "default"} className="mt-6 p-4" role={value.kind === "error" ? "alert" : "status"}>
      {value.kind === "error" ? <AlertTriangle aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
      <AlertDescription>
        {value.message}
        {value.requestId && <span className="mt-1 block text-xs">{copy.requestId}: {value.requestId}</span>}
        {onRetry && value.kind === "error" && (
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}>
            <RefreshCw aria-hidden="true" />{copy.refresh}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}

type UiLocale = "hy" | "ru" | "en";
export type LocalizedDraft = Record<UiLocale, Record<string, string>>;

export function LocalizedFields({ value, onChange, fields, disabled, primaryRequired = [] }: {
  value: LocalizedDraft;
  onChange: (value: LocalizedDraft) => void;
  fields: Array<{ name: string; label: string; multiline?: boolean; maxLength: number }>;
  disabled?: boolean;
  primaryRequired?: string[];
}) {
  const copy = useManagementCopy();
  const baseId = useId();
  const [locale, setLocale] = useState<UiLocale>("hy");
  const labels: Record<UiLocale, string> = {
    hy: copy.languageHy,
    ru: copy.languageRu,
    en: copy.languageEn,
  };
  return (
    <fieldset className="rounded-xl border bg-muted/20 p-4">
      <legend className="px-1 text-sm font-semibold">HY / RU / EN</legend>
      <div role="tablist" aria-label="HY / RU / EN" className="mt-1 flex flex-wrap gap-2">
        {(["hy", "ru", "en"] as const).map((item) => (
          <Button
            key={item}
            type="button"
            size="sm"
            variant={locale === item ? "secondary" : "outline"}
            role="tab"
            aria-selected={locale === item}
            aria-controls={`${baseId}-${item}`}
            id={`${baseId}-${item}-tab`}
            onClick={() => setLocale(item)}
          >
            {labels[item]} ({item.toUpperCase()})
          </Button>
        ))}
      </div>
      {(["hy", "ru", "en"] as const).map((item) => (
        <div
          key={item}
          id={`${baseId}-${item}`}
          role="tabpanel"
          aria-labelledby={`${baseId}-${item}-tab`}
          hidden={locale !== item}
          className="mt-4 space-y-4"
        >
          {fields.map((field) => {
            const required = item === "hy" && primaryRequired.includes(field.name);
            const props = {
              id: `${baseId}-${item}-${field.name}`,
              value: value[item][field.name] ?? "",
              maxLength: field.maxLength,
              required,
              disabled,
              "aria-required": required,
              onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({
                ...value,
                [item]: { ...value[item], [field.name]: event.target.value },
              }),
              className: fieldClass,
            };
            return (
              <label key={field.name} htmlFor={props.id} className={labelClass}>
                {field.label}{required ? " *" : ` (${copy.optional})`}
                {field.multiline ? <textarea {...props} rows={field.maxLength > 1000 ? 5 : 3} /> : <input {...props} />}
              </label>
            );
          })}
        </div>
      ))}
      {primaryRequired.length > 0 && <p className="mt-3 text-xs text-muted-foreground">{copy.armenianRequired}</p>}
    </fieldset>
  );
}

export function ConfirmActionDialog({ open, onOpenChange, title, body, pending, onConfirm, confirmLabel }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: string;
  pending: boolean;
  onConfirm: () => void;
  confirmLabel?: string;
}) {
  const copy = useManagementCopy();
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent closeLabel={copy.cancel}>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="mt-3">{body}</DialogDescription>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>{copy.cancel}</Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending ? copy.saving : confirmLabel ?? copy.confirmArchive}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function emptyLocalizedDraft(fields: string[]): LocalizedDraft {
  const blank = () => Object.fromEntries(fields.map((field) => [field, ""]));
  return { hy: blank(), ru: blank(), en: blank() };
}

export function localizedDraft(value: unknown, fields: string[]): LocalizedDraft {
  const result = emptyLocalizedDraft(fields);
  if (!value || typeof value !== "object") return result;
  for (const locale of ["hy", "ru", "en"] as const) {
    const translation = (value as Record<string, unknown>)[locale];
    if (!translation || typeof translation !== "object") continue;
    for (const field of fields) {
      const item = (translation as Record<string, unknown>)[field];
      if (Array.isArray(item)) result[locale][field] = item.join("\n");
      else if (typeof item === "string") result[locale][field] = item;
    }
  }
  return result;
}

export function compactTranslations(value: LocalizedDraft, arrayFields: string[] = []) {
  const translations: Record<string, Record<string, string | string[]>> = {};
  for (const locale of ["hy", "ru", "en"] as const) {
    const entry: Record<string, string | string[]> = {};
    for (const [field, raw] of Object.entries(value[locale])) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      entry[field] = arrayFields.includes(field)
        ? [...new Set(trimmed.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))]
        : trimmed;
    }
    if (Object.keys(entry).length > 0) translations[locale] = entry;
  }
  return translations;
}
