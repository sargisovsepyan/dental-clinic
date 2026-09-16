"use client";
import { useEffect, useState } from "react";
import { StaffApiError } from "@/api/staff-client";
import { parseAuditMetadata, utcFilterInstant, type AuditFilters, type AuditMetadata, type GovernedAudit } from "@/api/staff-governance";
import { useStaffAuth } from "@/components/staff/staff-auth-provider";
import { StaffAccessDenied } from "@/components/staff/staff-shell";
import { ManagementHeader, fieldClass, labelClass } from "@/components/staff/staff-management-shared";
import { GovernanceFeedback, GovernancePaginationControls, governanceTimestamp, useGovernanceCopy, useRoleLabel } from "@/components/staff/staff-governance-shared";
import { governanceActionLabel, governanceEntityLabel } from "@/i18n/staff-governance-messages";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function StaffAuditManagement() {
  const { user } = useStaffAuth();
  return user?.role === "admin" ? <AuditWorkspace /> : <StaffAccessDenied />;
}
function MetadataValue({ value }: { value: AuditMetadata }) {
  const gov = useGovernanceCopy();
  if (value === null) return <span>{gov.none}</span>;
  if (typeof value !== "object") return <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{String(value)}</span>;
  const entries = Array.isArray(value) ? value.map((item, index) => [String(index + 1), item] as const) : Object.entries(value);
  return entries.length ? <dl className="space-y-2 border-l pl-3">{entries.map(([key, item]) => <div key={key} className="min-w-0"><dt className="break-words text-xs font-semibold [overflow-wrap:anywhere]">{key}</dt><dd className="mt-1 text-sm"><MetadataValue value={item} /></dd></div>)}</dl> : <span>{gov.noMetadata}</span>;
}
export function AuditMetadataView({ value }: { value: unknown }) {
  const gov = useGovernanceCopy();
  let parsed: AuditMetadata;
  try { parsed = parseAuditMetadata(value); }
  catch { return <p role="alert">{gov.loadError}</p>; }
  return <MetadataValue value={parsed} />;
}
const emptyDraft = { action: "", entityType: "", entityId: "", actorId: "", from: "", to: "", limit: 10 };
function AuditWorkspace() {
  const { api, locale, copy, handleApiError } = useStaffAuth();
  const gov = useGovernanceCopy();
  const roleLabel = useRoleLabel();
  const [draft, setDraft] = useState(emptyDraft);
  const [filters, setFilters] = useState<AuditFilters>({ page: 1, limit: 10 });
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; data: Awaited<ReturnType<typeof api.listAuditLogs>> } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [validation, setValidation] = useState<string | null>(null);
  const [selected, setSelected] = useState<GovernedAudit | null>(null);
  const key = JSON.stringify([filters, revision]);
  const current = result?.key === key ? result.data : null;
  const loading = !current && error?.key !== key;
  useEffect(() => {
    const controller = new AbortController();
    void api.listAuditLogs(filters, controller.signal).then((data) => {
      if (!controller.signal.aborted) setResult({ key, data });
    }, (cause: unknown) => {
      if (controller.signal.aborted) return;
      handleApiError(cause);
      setError({ key, message: cause instanceof StaffApiError && cause.status === 403 ? gov.forbidden : gov.loadError });
    });
    return () => controller.abort();
  }, [api, filters, gov.forbidden, gov.loadError, handleApiError, key]);
  function apply(event: React.FormEvent) {
    event.preventDefault();
    try {
      const from = utcFilterInstant(draft.from);
      const to = utcFilterInstant(draft.to);
      if ((from && to && from > to) || (draft.actorId.trim() && !/^[a-f\d]{24}$/iu.test(draft.actorId.trim()))) throw new Error("Invalid audit range");
      setValidation(null); setSelected(null);
      setFilters({ action: draft.action.trim() || undefined, entityType: draft.entityType.trim() || undefined, entityId: draft.entityId.trim() || undefined, actorId: draft.actorId.trim() || undefined, from, to, page: 1, limit: draft.limit });
      setRevision((value) => value + 1);
    } catch { setValidation(gov.invalidRange); }
  }
  function actor(log: GovernedAudit) {
    return log.actor ? <><p className="break-words font-medium">{log.actor.name}</p><p className="text-xs text-muted-foreground">{roleLabel(log.actor.role)}</p><p className="mt-1 break-all text-xs text-muted-foreground">{log.actor.email}</p></> : <p className="text-sm text-muted-foreground">{gov.unknownActor}</p>;
  }
  function action(log: GovernedAudit) {
    return <><p className="break-words font-semibold [overflow-wrap:anywhere]">{governanceActionLabel(log.action, locale) || gov.none}</p><p className="mt-1 break-all text-xs text-muted-foreground">{log.action}</p></>;
  }
  function entity(log: GovernedAudit) {
    return <><p className="break-words">{governanceEntityLabel(log.entityType, locale) || gov.none}</p><p className="mt-1 break-all text-xs text-muted-foreground">{log.entityId || gov.none}</p></>;
  }
  return <div className="min-w-0">
    <ManagementHeader eyebrow={gov.auditReadOnly} title={gov.auditTitle} intro={gov.auditIntro} />
    <form className="mt-8 grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2 xl:grid-cols-4" onSubmit={apply}>
      {(["action", "entityType", "entityId", "actorId"] as const).map((name) => <label key={name} className={labelClass}>{gov[name]}<input className={fieldClass} value={draft[name]} maxLength={name === "action" ? 120 : name === "entityType" ? 80 : name === "actorId" ? 24 : 150} onChange={(event) => setDraft({ ...draft, [name]: event.target.value })} autoComplete="off" spellCheck={false} /></label>)}
      <label className={labelClass}>{gov.fromUtc}<input type="datetime-local" step="1" className={fieldClass} value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} /></label>
      <label className={labelClass}>{gov.toUtc}<input type="datetime-local" step="1" className={fieldClass} value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} /></label>
      <label className={labelClass}>{gov.rows}<select className={fieldClass} value={draft.limit} onChange={(event) => setDraft({ ...draft, limit: Number(event.target.value) })}>{[10, 25, 50].map((limit) => <option key={limit} value={limit}>{limit}</option>)}</select></label>
      <div className="flex flex-wrap items-end gap-2"><Button type="submit">{copy.applyFilters}</Button><Button type="button" variant="outline" onClick={() => { setDraft(emptyDraft); setFilters({ page: 1, limit: 10 }); setValidation(null); setSelected(null); setRevision((value) => value + 1); }}>{copy.clearFilters}</Button></div>
      <p className="text-xs leading-5 text-muted-foreground sm:col-span-2 xl:col-span-4">{gov.utcHelp}</p>
    </form>
    <GovernanceFeedback value={validation ? { error: true, message: validation } : null} />
    <div className="mt-6 flex justify-end"><Button variant="outline" onClick={() => setRevision((value) => value + 1)}>{copy.refresh}</Button></div>
    {loading && <p role="status" className="mt-6">{gov.loadingAudit}</p>}
    {error?.key === key && <GovernanceFeedback value={{ error: true, message: error.message }} />}
    {current && <>
      {!current.logs.length && <p role="status" className="mt-6">{gov.emptyAudit}</p>}
      <div className="mt-6 hidden rounded-xl border bg-card xl:block"><table className="w-full table-fixed text-left text-sm"><caption className="sr-only">{gov.auditTitle}</caption><thead className="border-b bg-muted/50"><tr>{[gov.actor, gov.action, gov.entity, copy.time, copy.actions].map((label) => <th key={label} scope="col" className="p-4 font-semibold">{label}</th>)}</tr></thead><tbody>{current.logs.map((log) => <tr key={log.id} className="border-b last:border-0"><td className="p-4 align-top">{actor(log)}</td><td className="p-4 align-top">{action(log)}</td><td className="p-4 align-top">{entity(log)}</td><td className="p-4 align-top"><time dateTime={log.createdAt}>{governanceTimestamp(log.createdAt, locale)}</time></td><td className="p-4 align-top"><Button variant="outline" size="sm" onClick={() => setSelected(log)}>{copy.view}</Button></td></tr>)}</tbody></table></div>
      <ul className="mt-6 grid gap-4 md:grid-cols-2 xl:hidden" aria-label={gov.auditTitle}>{current.logs.map((log) => <li key={log.id} className="min-w-0 rounded-xl border bg-card p-5"><div>{action(log)}</div><div className="mt-4">{actor(log)}</div><div className="mt-4 text-sm">{entity(log)}</div><time className="mt-4 block text-xs text-muted-foreground" dateTime={log.createdAt}>{governanceTimestamp(log.createdAt, locale)}</time><Button className="mt-4" variant="outline" size="sm" onClick={() => setSelected(log)}>{copy.view}</Button></li>)}</ul>
      <GovernancePaginationControls value={current.pagination} pending={false} onPage={(page) => { setSelected(null); setFilters({ ...filters, page }); }} />
    </>}
    <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}><DialogContent closeLabel={copy.close}>
      <DialogTitle>{gov.auditDetail}</DialogTitle><DialogDescription className="mt-3">{gov.auditReadOnly} · {gov.utcHelp}</DialogDescription>
      {selected && <div className="mt-5 min-w-0 space-y-5">{action(selected)}{actor(selected)}{entity(selected)}<p>{governanceTimestamp(selected.createdAt, locale)}</p><dl className="space-y-3 text-sm"><div><dt className="font-semibold">{copy.requestId}</dt><dd className="break-all">{selected.requestId || gov.none}</dd></div><div><dt className="font-semibold">{gov.methodPath}</dt><dd className="break-all">{selected.method} {selected.path}</dd></div></dl><h2 className="font-semibold">{gov.metadata}</h2><AuditMetadataView value={selected.metadata} /></div>}
    </DialogContent></Dialog>
  </div>;
}
