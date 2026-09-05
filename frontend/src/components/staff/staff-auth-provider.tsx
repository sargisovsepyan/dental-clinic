"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState } from "react";
import { StaffApiError, staffApi, type StaffUser } from "@/api/staff-client";
import type { Locale } from "@/i18n/locales";
import { staffMessages, type StaffMessages } from "@/i18n/staff-messages";

type SessionStatus = "loading" | "authenticated" | "anonymous" | "unavailable";
type StaffAuthValue = {
  locale: Locale;
  copy: StaffMessages;
  status: SessionStatus;
  user: StaffUser | null;
  notice: string | null;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  retryBootstrap(): Promise<void>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  handleApiError(error: unknown): void;
  clearNotice(): void;
  api: typeof staffApi;
};

const StaffAuthContext = createContext<StaffAuthValue | null>(null);
const channelName = "dental-clinic-staff-session";

export function StaffAuthProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const copy = staffMessages[locale];
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [user, setUser] = useState<StaffUser | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const tabId = useId();

  const clearLocalSession = useCallback((next: Exclude<SessionStatus, "authenticated" | "loading"> = "anonymous") => {
    staffApi.clearSession();
    setUser(null);
    setStatus(next);
  }, []);

  const publishClear = useCallback(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(channelName);
    channel.postMessage({ type: "session-cleared", source: tabId });
    channel.close();
  }, [tabId]);

  const retryBootstrap = useCallback(async () => {
    setStatus("loading");
    setNotice(null);
    try {
      const current = await staffApi.bootstrap();
      setUser(current);
      setStatus("authenticated");
    } catch (error) {
      setUser(null);
      setStatus(error instanceof StaffApiError && error.status === 401 ? "anonymous" : "unavailable");
    }
  }, []);

  useEffect(() => {
    let active = true;
    void staffApi.bootstrap().then(
      (current) => {
        if (!active) return;
        setUser(current);
        setStatus("authenticated");
      },
      (error: unknown) => {
        if (!active) return;
        setUser(null);
        setStatus(error instanceof StaffApiError && error.status === 401 ? "anonymous" : "unavailable");
      },
    );
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(channelName);
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (event.data && typeof event.data === "object" && "type" in event.data &&
          event.data.type === "session-cleared" && (!("source" in event.data) || event.data.source !== tabId)) {
        clearLocalSession();
        setNotice(copy.sessionEnded);
      }
    };
    return () => channel.close();
  }, [clearLocalSession, copy.sessionEnded, tabId]);

  const login = useCallback(async (email: string, password: string) => {
    setNotice(null);
    const current = await staffApi.login(email, password);
    setUser(current);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    setNotice(null);
    try {
      await staffApi.logout();
      clearLocalSession();
      publishClear();
    } catch (error) {
      clearLocalSession();
      publishClear();
      setNotice(copy.logoutUncertain);
      throw error;
    }
  }, [clearLocalSession, copy.logoutUncertain, publishClear]);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    try {
      await staffApi.changePassword(currentPassword, newPassword);
      clearLocalSession();
      setNotice(copy.passwordChanged);
      publishClear();
    } catch (error) {
      if (!staffApi.hasAccessToken()) {
        clearLocalSession(error instanceof StaffApiError && error.status === 401 ? "anonymous" : "unavailable");
        publishClear();
      }
      throw error;
    }
  }, [clearLocalSession, copy.passwordChanged, publishClear]);

  const handleApiError = useCallback((error: unknown) => {
    if (!(error instanceof StaffApiError) || staffApi.hasAccessToken()) return;
    clearLocalSession(error.status === 401 ? "anonymous" : "unavailable");
  }, [clearLocalSession]);

  const value = useMemo<StaffAuthValue>(() => ({
    locale, copy, status, user, notice, login, logout, retryBootstrap, changePassword,
    handleApiError, clearNotice: () => setNotice(null), api: staffApi,
  }), [locale, copy, status, user, notice, login, logout, retryBootstrap, changePassword, handleApiError]);

  return <StaffAuthContext.Provider value={value}>{children}</StaffAuthContext.Provider>;
}

export function useStaffAuth() {
  const value = useContext(StaffAuthContext);
  if (!value) throw new Error("useStaffAuth must be used inside StaffAuthProvider");
  return value;
}
