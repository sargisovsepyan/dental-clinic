import type { MetadataRoute } from "next";
import { getBeforeAfterCases, getDentists, getServices } from "@/api/public-client";
import { locales, localizedPath } from "@/i18n/locales";
import { getFrontendEnvironment } from "@/lib/env";

const staticPaths = ["", "services", "dentists", "gallery", "before-after", "clinic"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { siteBaseUrl } = getFrontendEnvironment();
  const paths = new Set(staticPaths.flatMap((path) => locales.map((locale) => localizedPath(locale, path))));

  try {
    const [services, dentists, firstBeforeAfterPage] = await Promise.all([
      getServices(),
      getDentists(),
      getBeforeAfterCases({ limit: 100 }),
    ]);
    const beforeAfterCases = [...firstBeforeAfterPage.cases];
    for (let page = 2; page <= firstBeforeAfterPage.pagination.pages; page += 1) {
      const result = await getBeforeAfterCases({ page, limit: 100 });
      beforeAfterCases.push(...result.cases);
    }
    for (const locale of locales) {
      for (const service of services) paths.add(localizedPath(locale, `services/${service.slug}`));
      for (const dentist of dentists) paths.add(localizedPath(locale, `dentists/${dentist.slug}`));
      for (const item of beforeAfterCases) paths.add(localizedPath(locale, `before-after/${item._id}`));
    }
  } catch {
    // Static public routes remain discoverable when the API is unavailable during generation.
  }

  return [...paths].map((path) => ({
    url: `${siteBaseUrl}${path}`,
    changeFrequency: path.split("/").length > 3 ? "weekly" : "daily",
    priority: path.split("/").length > 3 ? 0.6 : path.split("/").length === 2 ? 1 : 0.8,
  }));
}
