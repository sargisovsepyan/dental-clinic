import type { Metadata } from "next";
import { headers } from "next/headers";
import "@fontsource-variable/noto-sans-armenian";
import "@fontsource/noto-serif-armenian/400.css";
import "@fontsource/noto-serif-armenian/600.css";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL!),
  title: {
    default: "Arelis Dental",
    template: "%s | Arelis Dental",
  },
  description: "Ատամնաբուժական խնամք Երևանի կենտրոնում։",
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    title: "Arelis Dental",
    description: "Ատամնաբուժական խնամք Երևանի կենտրոնում։",
    images: [{ url: "/arelis-social.svg", width: 1200, height: 630, alt: "Arelis Dental" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Arelis Dental",
    description: "Ատամնաբուժական խնամք Երևանի կենտրոնում։",
    images: ["/arelis-social.svg"],
  },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const requestHeaders = await headers();
  const locale = requestHeaders.get("x-site-locale") ?? "hy";

  return (
    <html lang={locale} data-scroll-behavior="smooth" className="h-full bg-background antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
