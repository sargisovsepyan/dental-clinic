"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, LayoutDashboard, LockKeyhole, LogOut, Menu, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useStaffAuth } from "@/components/staff/staff-auth-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

function roleLabel(role: "admin" | "receptionist" | "dentist", copy: ReturnType<typeof useStaffAuth>["copy"]) {
  return role === "admin" ? copy.roleAdmin : role === "receptionist" ? copy.roleReceptionist : copy.roleDentist;
}

function StaffNavigation({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  const { locale, copy, user } = useStaffAuth();
  const pathname = usePathname();
  if (!user) return null;
  const links = [
    { href: `/${locale}/staff`, label: copy.dashboard, icon: LayoutDashboard, exact: true },
    ...(user.role !== "dentist" ? [{ href: `/${locale}/staff/appointments`, label: copy.appointments, icon: CalendarDays, exact: false }] : []),
    { href: `/${locale}/staff/account`, label: copy.account, icon: UserRound, exact: false },
  ];
  return (
    <nav aria-label={copy.workspace} className={cn("space-y-1", mobile && "px-3")}>
      {links.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link key={href} href={href as Route} onClick={onNavigate} aria-current={active ? "page" : undefined}
            className={cn("flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors", active ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
            <Icon aria-hidden="true" className="size-4" />{label}
          </Link>
        );
      })}
    </nav>
  );
}

export function StaffWorkspaceShell({ children }: { children: React.ReactNode }) {
  const { locale, copy, status, user, notice, logout, retryBootstrap } = useStaffAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  useEffect(() => {
    if (status === "anonymous") router.replace(`/${locale}/staff/login` as Route);
  }, [locale, router, status]);

  if (status === "loading") {
    return <main className="flex min-h-screen items-center justify-center p-6"><p role="status" className="text-sm text-muted-foreground">{copy.sessionChecking}</p></main>;
  }
  if (status === "unavailable") {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <Alert className="max-w-lg p-6"><LockKeyhole aria-hidden="true" /><AlertDescription className="mt-2">{copy.sessionUnavailable}</AlertDescription><Button className="mt-5" onClick={() => void retryBootstrap()}>{copy.retrySession}</Button></Alert>
      </main>
    );
  }
  if (status !== "authenticated" || !user) {
    return <main className="flex min-h-screen items-center justify-center p-6"><p role="status">{copy.sessionEnded}</p></main>;
  }

  async function signOut() {
    if (logoutPending) return;
    setLogoutPending(true);
    try { await logout(); } catch { /* the provider presents the uncertain-revocation notice */ }
    router.replace(`/${locale}/staff/login` as Route);
  }

  return (
    <div className="min-h-screen bg-muted/35 lg:grid lg:grid-cols-[17rem_1fr]">
      <aside className="hidden min-h-screen border-r bg-card lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div className="border-b p-6">
          <Link href={`/${locale}/staff` as Route} className="flex items-center gap-3 font-semibold">
            <span className="flex size-10 items-center justify-center rounded-xl bg-secondary"><ShieldCheck aria-hidden="true" className="size-5" /></span>
            <span><span className="block">{copy.brand}</span><span className="block text-xs font-normal text-muted-foreground">{copy.workspace}</span></span>
          </Link>
        </div>
        <div className="flex-1 p-4"><StaffNavigation /></div>
        <div className="border-t p-4">
          <p className="truncate px-3 text-sm font-semibold">{user.name}</p>
          <p className="mt-1 px-3 text-xs text-muted-foreground">{roleLabel(user.role, copy)}</p>
          <Button variant="ghost" className="mt-3 w-full justify-start" onClick={() => void signOut()} disabled={logoutPending}><LogOut aria-hidden="true" />{logoutPending ? copy.loggingOut : copy.logout}</Button>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur lg:px-8">
          <div className="flex items-center gap-3">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger render={<Button variant="outline" size="icon" className="lg:hidden" />}><Menu aria-hidden="true" /><span className="sr-only">{copy.menu}</span></SheetTrigger>
              <SheetContent side="left" closeLabel={copy.closeMenu} className="w-[min(88vw,20rem)] bg-card">
                <SheetHeader><SheetTitle>{copy.workspace}</SheetTitle><SheetDescription>{user.name} · {roleLabel(user.role, copy)}</SheetDescription></SheetHeader>
                <StaffNavigation mobile onNavigate={() => setMenuOpen(false)} />
                <div className="mt-auto border-t p-4"><Button variant="outline" className="w-full justify-start" onClick={() => void signOut()} disabled={logoutPending}><LogOut aria-hidden="true" />{copy.logout}</Button></div>
              </SheetContent>
            </Sheet>
            <p className="text-sm font-semibold lg:hidden">{copy.workspace}</p>
          </div>
          <div className="text-right"><p className="max-w-48 truncate text-sm font-medium">{user.name}</p><p className="text-xs text-muted-foreground">{roleLabel(user.role, copy)}</p></div>
        </header>
        {notice && <div className="px-4 pt-4 lg:px-8"><Alert><AlertDescription>{notice}</AlertDescription></Alert></div>}
        <main id="main-content" tabIndex={-1} className="p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

export function StaffAccessDenied() {
  const { copy } = useStaffAuth();
  return <Alert className="max-w-2xl p-6"><AlertDescription><strong className="block text-base text-foreground">{copy.accessDenied}</strong><span className="mt-2 block">{copy.accessDeniedBody}</span></AlertDescription></Alert>;
}
