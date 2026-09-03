import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { Locale } from "@/i18n/locales";
import { messages } from "@/i18n/messages";
import { cn } from "@/lib/utils";

export function PageIntro({
  eyebrow,
  title,
  description,
  titleLang,
  descriptionLang,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  titleLang?: Locale;
  descriptionLang?: Locale;
}) {
  return (
    <header className="site-container max-w-4xl pb-12 pt-16 sm:pb-16 sm:pt-24">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1 lang={titleLang} className="display-type mt-4 text-balance text-4xl leading-[1.12] sm:text-6xl">{title}</h1>
      {description && <p lang={descriptionLang} className="mt-6 max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">{description}</p>}
    </header>
  );
}

export function SectionHeading({ eyebrow, title, description, className }: { eyebrow?: string; title: string; description?: string; className?: string }) {
  return (
    <div className={cn("max-w-2xl", className)}>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h2 className="display-type mt-3 text-balance text-3xl leading-tight sm:text-5xl">{title}</h2>
      {description && <p className="mt-5 leading-7 text-muted-foreground">{description}</p>}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="border-y py-14 text-center text-muted-foreground">{children}</p>;
}

export function ErrorState({ locale, requestId }: { locale: Locale; requestId?: string }) {
  const copy = messages[locale];
  return (
    <Alert className="mx-auto max-w-2xl border-destructive/25 bg-card p-5" variant="destructive">
      <AlertCircle aria-hidden="true" />
      <AlertTitle>{copy.unavailableTitle}</AlertTitle>
      <AlertDescription>
        <p>{copy.unavailableBody}</p>
        {requestId && <p className="mt-2 font-mono text-xs">{copy.supportReference}: {requestId}</p>}
      </AlertDescription>
    </Alert>
  );
}
