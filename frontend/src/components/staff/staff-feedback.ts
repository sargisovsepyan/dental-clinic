import { StaffApiError } from "@/api/staff-client";
import type { StaffMessages } from "@/i18n/staff-messages";

export function staffErrorMessage(error: unknown, copy: StaffMessages) {
  if (!(error instanceof StaffApiError)) return copy.serverError;
  if (error.status === 401) return copy.invalidCredentials;
  if (error.status === 400) return copy.validationError;
  if (error.status === 429) return copy.rateLimited;
  if (error.kind === "network" || error.kind === "timeout") return copy.networkError;
  return copy.serverError;
}
