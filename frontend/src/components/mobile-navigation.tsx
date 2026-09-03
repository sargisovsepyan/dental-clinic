"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu } from "lucide-react";
import type { Locale } from "@/i18n/locales";
import type { Messages } from "@/i18n/messages";
import { localizedPath } from "@/i18n/locales";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { LocaleSwitcher } from "@/components/locale-switcher";

const navItems = [
  ["services", "services"],
  ["dentists", "dentists"],
  ["gallery", "gallery"],
  ["results", "before-after"],
  ["clinic", "clinic"],
] as const;

export function MobileNavigation({ locale, copy }: { locale: Locale; copy: Messages }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button variant="ghost" size="icon" aria-label={copy.menu} className="xl:hidden" />}
      >
        <Menu aria-hidden="true" />
      </SheetTrigger>
      <SheetContent side="right" closeLabel={copy.closeMenu} className="w-[min(88vw,24rem)] p-2">
        <SheetHeader className="border-b px-4 pb-5 pt-4">
          <SheetTitle className="display-type text-xl">{copy.menu}</SheetTitle>
          <SheetDescription>{copy.language}</SheetDescription>
        </SheetHeader>
        <nav aria-label={copy.primaryNavigation} className="flex flex-col px-2 py-3">
          {navItems.map(([key, segment]) => (
            <Link
              key={key}
              href={localizedPath(locale, segment)}
              onClick={() => setOpen(false)}
              className="flex min-h-12 items-center border-b px-3 text-base font-semibold last:border-b-0 hover:bg-muted"
            >
              {copy[key]}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t p-3">
          <LocaleSwitcher locale={locale} label={copy.language} compact />
        </div>
      </SheetContent>
    </Sheet>
  );
}
