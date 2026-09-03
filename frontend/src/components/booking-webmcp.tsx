"use client";

import { useEffect } from "react";
import type { BookingDentistOption, BookingServiceOption } from "@/components/booking-flow";

interface ModelContext {
  registerTool: (tool: {
    name: string;
    title: string;
    description: string;
    inputSchema: Record<string, unknown>;
    annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
    execute: (input: unknown) => unknown;
  }, options?: { signal?: AbortSignal }) => void | Promise<void>;
}

declare global {
  interface Document {
    readonly modelContext?: ModelContext;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export function BookingWebMcp({
  services,
  dentists,
  onStage,
}: {
  services: BookingServiceOption[];
  dentists: BookingDentistOption[];
  onStage: (serviceId: string, dentistId: string, date?: string) => void;
}) {
  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const registration = context.registerTool({
      name: "stage_booking_selection",
      title: "Prepare a clinic booking",
      description: "Select a compatible service, dentist, and optional date in the visible booking form. This only prepares the form; it does not submit patient data or create an appointment.",
      inputSchema: {
        type: "object",
        properties: {
          serviceSlug: { type: "string", minLength: 2, maxLength: 180 },
          dentistSlug: { type: "string", minLength: 2, maxLength: 180 },
          date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        },
        required: ["serviceSlug", "dentistSlug"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!isRecord(input) || typeof input.serviceSlug !== "string" || typeof input.dentistSlug !== "string") {
          throw new Error("serviceSlug and dentistSlug are required");
        }
        const service = services.find((item) => item.slug === input.serviceSlug);
        const dentist = dentists.find((item) => item.slug === input.dentistSlug);
        if (!service || !dentist || !dentist.serviceIds.includes(service.id)) {
          throw new Error("The service and dentist must be a current compatible booking option");
        }
        const date = input.date;
        if (date !== undefined && (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
          throw new Error("date must use YYYY-MM-DD");
        }
        onStage(service.id, dentist.id, date);
        return { staged: true, serviceSlug: service.slug, dentistSlug: dentist.slug, ...(date ? { date } : {}) };
      },
    }, { signal: lifecycle.signal });
    void Promise.resolve(registration).catch(() => lifecycle.abort());
    return () => lifecycle.abort();
  }, [dentists, onStage, services]);
  return null;
}
