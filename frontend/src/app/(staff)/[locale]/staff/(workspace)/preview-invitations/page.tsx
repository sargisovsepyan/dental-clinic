import { notFound } from "next/navigation";
import { StaffPreviewInvitations } from "@/components/staff/staff-preview-invitations";

export default function PreviewInvitationsPage() {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.NEXT_PUBLIC_ARELIS_PREVIEW_MODE !== "supervised"
  ) notFound();
  return <StaffPreviewInvitations />;
}
