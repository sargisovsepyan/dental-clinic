import type { MetadataRoute } from "next";
import { getFrontendEnvironment } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const { siteBaseUrl } = getFrontendEnvironment();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/staff", "/hy/staff", "/ru/staff", "/en/staff"],
    },
    sitemap: `${siteBaseUrl}/sitemap.xml`,
  };
}
