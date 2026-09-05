"use client";

import { useEffect } from "react";

export function StaffTokenRedirect({ kind }: { kind: "setup-password" | "reset-password" }) {
  useEffect(() => {
    window.location.replace(`/hy/staff/${kind}${window.location.hash}`);
  }, [kind]);
  return <main className="flex min-h-screen items-center justify-center p-6"><p role="status">Opening the secure password form…</p></main>;
}
