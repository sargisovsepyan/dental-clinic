"use client";

import Image from "next/image";
import { ImageIcon } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { StaffApiError } from "@/api/staff-client";
import { MEDIA_FILE_ACCEPT, validateMediaFile, type MediaFileProblem } from "@/api/staff-media";
import { PublicImage } from "@/components/public-media";
import { useStaffAuth } from "@/components/staff/staff-auth-provider";
import { fieldClass, labelClass, type ManagementFeedbackValue } from "@/components/staff/staff-management-shared";
import { staffMediaMessages, type StaffMediaMessages } from "@/i18n/staff-media-messages";
import { getFrontendEnvironment } from "@/lib/env";
import { safeManagedImage, type PublicImageAsset } from "@/lib/safe-urls";

export function useMediaCopy() {
  const { locale } = useStaffAuth();
  return staffMediaMessages[locale];
}

export function mediaFeedback(
  error: unknown,
  copy: StaffMediaMessages,
  options: { uncertainMutation?: boolean } = {},
): ManagementFeedbackValue {
  if (!(error instanceof StaffApiError)) return { kind: "error", message: copy.serverError };
  const requestId = error.requestId;
  if (error.kind === "protocol") return { kind: "error", message: copy.protocolError, requestId };
  if (error.status === 400) return { kind: "error", message: copy.validationError, requestId };
  if (error.status === 403) return { kind: "error", message: copy.forbiddenError, requestId };
  if (error.status === 404) return { kind: "error", message: copy.notFoundError, requestId };
  if (error.status === 409) return { kind: "error", message: copy.conflictError, requestId };
  if (error.status === 413) return { kind: "error", message: copy.tooLargeFile, requestId };
  if (error.status === 415) return { kind: "error", message: copy.unsupportedFile, requestId };
  if (error.status === 429) return { kind: "error", message: copy.rateLimitError, requestId };
  if (options.uncertainMutation && (error.kind === "network" || error.kind === "timeout")) {
    return { kind: "error", message: copy.uploadUncertain, requestId };
  }
  return { kind: "error", message: copy.serverError, requestId };
}

function fileProblemText(problem: MediaFileProblem | null, copy: StaffMediaMessages) {
  if (problem === "empty") return copy.emptyFile;
  if (problem === "too-large") return copy.tooLargeFile;
  if (problem === "unsupported") return copy.unsupportedFile;
  return "";
}

export function StaffFileField({
  label,
  file,
  onFile,
  disabled,
  required = true,
}: {
  label: string;
  file: File | null;
  onFile: (file: File | null) => void;
  disabled?: boolean;
  required?: boolean;
}) {
  const copy = useMediaCopy();
  const id = useId();
  const previewUrl = useMemo(() => file ? URL.createObjectURL(file) : null, [file]);
  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);
  const problem = validateMediaFile(file);
  return (
    <div className="rounded-xl border bg-muted/20 p-4">
      <label htmlFor={id} className={labelClass}>{label}{required ? " *" : ""}</label>
      <input
        id={id}
        className={`${fieldClass} file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:font-medium`}
        type="file"
        accept={MEDIA_FILE_ACCEPT}
        required={required}
        disabled={disabled}
        aria-invalid={Boolean(file && problem)}
        aria-describedby={`${id}-help ${id}-error`}
        onChange={(event) => onFile(event.target.files?.[0] ?? null)}
      />
      <p id={`${id}-help`} className="mt-2 text-xs leading-5 text-muted-foreground">{copy.allowedFiles}</p>
      {file && <p className="mt-2 break-all text-sm"><strong>{copy.selectedFile}:</strong> {file.name}</p>}
      {file && problem && <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-destructive">{fileProblemText(problem, copy)}</p>}
      {previewUrl && !problem && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{copy.localPreview}</p>
          <LocalFilePreview key={previewUrl} src={previewUrl} fileName={file?.name ?? ""} />
        </div>
      )}
    </div>
  );
}

function LocalFilePreview({ src, fileName }: { src: string; fileName: string }) {
  const copy = useMediaCopy();
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <div className="flex min-h-36 items-center justify-center gap-2 rounded-lg bg-muted p-4 text-sm text-muted-foreground"><ImageIcon aria-hidden="true" />{copy.previewUnavailable}</div>;
  }
  return <Image
    unoptimized
    src={src}
    alt={`${copy.localPreview}: ${fileName}`}
    width={640}
    height={420}
    className="max-h-64 w-full rounded-lg bg-muted object-contain"
    onError={() => setFailed(true)}
  />;
}

export function ManagedMediaPreview({
  asset,
  alt,
  className = "aspect-[4/3] rounded-lg",
  priority = false,
}: {
  asset: PublicImageAsset | null;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  const safeImage = safeManagedImage(asset, getFrontendEnvironment().cloudinaryCloudName);
  return <PublicImage image={safeImage} alt={alt} priority={priority} className={className} imageClassName="h-full w-full object-cover" />;
}

export function MediaStatusBadge({ label, tone }: { label: string; tone: "safe" | "warning" | "danger" | "muted" }) {
  const classes = {
    safe: "bg-secondary text-secondary-foreground",
    warning: "bg-amber-100 text-amber-900",
    danger: "bg-destructive/10 text-destructive",
    muted: "bg-muted text-muted-foreground",
  };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${classes[tone]}`}>{label}</span>;
}
