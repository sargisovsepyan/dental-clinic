"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
    };
  }
}

export function BookingChallenge({
  provider,
  siteKey,
  locale,
  label,
  loadingLabel,
  errorLabel,
  resetVersion,
  onToken,
  onError,
}: {
  provider: "disabled" | "turnstile";
  siteKey?: string;
  locale: "hy" | "ru" | "en";
  label: string;
  loadingLabel: string;
  errorLabel: string;
  resetVersion: number;
  onToken: (token?: string) => void;
  onError: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<string | undefined>(undefined);

  const removeWidget = useCallback(() => {
    if (widgetRef.current && window.turnstile) window.turnstile.remove(widgetRef.current);
    widgetRef.current = undefined;
  }, []);

  const renderWidget = useCallback(() => {
    if (provider !== "turnstile" || !siteKey || !hostRef.current || !window.turnstile || widgetRef.current) return;
    widgetRef.current = window.turnstile.render(hostRef.current, {
      sitekey: siteKey,
      language: locale,
      theme: "light",
      callback: (token: string) => onToken(token),
      "expired-callback": () => onToken(undefined),
      "timeout-callback": () => onToken(undefined),
      "error-callback": () => {
        onToken(undefined);
        onError();
      },
    });
  }, [locale, onError, onToken, provider, siteKey]);

  useEffect(() => {
    if (provider !== "turnstile") return;
    removeWidget();
    onToken(undefined);
    renderWidget();
    return removeWidget;
  }, [onToken, provider, removeWidget, renderWidget, resetVersion]);

  if (provider === "disabled") return null;

  return (
    <fieldset className="rounded-lg border bg-card p-4">
      <legend className="px-1 text-sm font-bold">{label}</legend>
      <p className="mb-3 text-sm text-muted-foreground" aria-live="polite">{loadingLabel}</p>
      <div ref={hostRef} />
      <noscript><p className="text-sm text-destructive">{errorLabel}</p></noscript>
      <Script
        id="cloudflare-turnstile"
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={renderWidget}
        onError={onError}
      />
    </fieldset>
  );
}
