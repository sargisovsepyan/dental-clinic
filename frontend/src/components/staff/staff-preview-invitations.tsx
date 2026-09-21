"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";
import type { PreviewInvitation } from "@/api/staff-client";
import { useStaffAuth } from "@/components/staff/staff-auth-provider";
import { StaffAccessDenied } from "@/components/staff/staff-shell";
import { ManagementHeader } from "@/components/staff/staff-management-shared";
import { governanceTimestamp, useRoleLabel } from "@/components/staff/staff-governance-shared";
import { buttonVariants } from "@/components/ui/button";
import { staffOnboardingMessages } from "@/i18n/staff-onboarding-messages";
import { getFrontendEnvironment } from "@/lib/env";

export function StaffPreviewInvitations() {
  const { user } = useStaffAuth();
  if (!getFrontendEnvironment().previewMode || user?.role !== "admin") return <StaffAccessDenied />;
  return <PreviewInbox />;
}

function PreviewInbox() {
  const { api, locale, copy, handleApiError } = useStaffAuth();
  const text = staffOnboardingMessages[locale];
  const roleLabel = useRoleLabel();
  const [invitations, setInvitations] = useState<PreviewInvitation[] | null>(null);
  const [timezone, setTimezone] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      api.listPreviewInvitations(controller.signal),
      api.getClinic(controller.signal),
    ]).then(([items, clinic]) => {
      if (!controller.signal.aborted) { setInvitations(items); setTimezone(clinic.timezone); }
    }, (error: unknown) => {
      if (!controller.signal.aborted) { handleApiError(error); setFailed(true); }
    });
    return () => controller.abort();
  }, [api, handleApiError]);

  const status = (value: PreviewInvitation["status"]) => ({
    pending: text.previewStatusPending,
    opened: text.previewStatusOpened,
    activated: text.previewStatusActivated,
    cancelled: text.previewStatusCancelled,
    replaced: text.previewStatusReplaced,
  })[value];

  return <section className="max-w-5xl">
    <ManagementHeader eyebrow={copy.secureArea} title={text.previewInboxTitle} intro={text.previewInboxIntro} />
    {failed && <p role="alert" className="mt-6 text-destructive">{copy.networkError}</p>}
    {!invitations && !failed && <p role="status" className="mt-6">{copy.sessionChecking}</p>}
    {invitations?.length === 0 && <p className="mt-6 rounded-xl border bg-card p-5 text-muted-foreground">{text.previewInboxEmpty}</p>}
    {invitations && invitations.length > 0 && <ul className="mt-6 space-y-4">
      {invitations.map((invitation) => <li key={invitation.id} className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{invitation.name}</h2><p className="mt-1 break-all text-sm text-muted-foreground">{text.previewRecipient}: {invitation.recipient}</p><p className="mt-1 text-sm">{roleLabel(invitation.role)} · {status(invitation.status)}</p>{timezone && <p className="mt-1 text-xs text-muted-foreground">{text.previewCreated}: {governanceTimestamp(invitation.createdAt, locale, timezone)}</p>}</div>{["pending", "opened"].includes(invitation.status) && <Link className={buttonVariants()} href={`/${locale}/staff/setup-password?previewInvitation=${invitation.id}` as Route}>{text.openInvitation}</Link>}</div>
      </li>)}
    </ul>}
  </section>;
}
