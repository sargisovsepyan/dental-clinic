import type { Metadata } from "next";
import { headers } from "next/headers";
import "@fontsource-variable/noto-sans-armenian";
import "@fontsource/noto-serif-armenian/400.css";
import "@fontsource/noto-serif-armenian/600.css";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL!),
  title: {
    default: "Dental Clinic",
    template: "%s | Dental Clinic",
  },
  description: "Public clinic information, services, dentists, and published gallery content.",
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    title: "Dental Clinic",
    description: "Public clinic information, services, dentists, and published gallery content.",
    images: [{ url: "/og.png", width: 1733, height: 916, alt: "Dental Clinic" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Dental Clinic",
    description: "Public clinic information, services, dentists, and published gallery content.",
    images: ["/og.png"],
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
