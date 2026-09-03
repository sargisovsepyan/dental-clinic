import type { MetadataRoute } from "next";
import { getFrontendEnvironment } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const { siteBaseUrl } = getFrontendEnvironment();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${siteBaseUrl}/sitemap.xml`,
  };
}
