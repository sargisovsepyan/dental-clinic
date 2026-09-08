"use client";

import { useStaffAuth } from "@/components/staff/staff-auth-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function StaffCatalogError() {
  const { copy } = useStaffAuth();
  return <Alert variant="destructive" role="alert"><AlertDescription>{copy.serverError}</AlertDescription></Alert>;
}
