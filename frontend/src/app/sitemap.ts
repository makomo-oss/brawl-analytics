import type { MetadataRoute } from "next"
import { getSnapshot } from "@/lib/server-brawler-pages"
import { brawlerEntries, brawlerPage } from "@/lib/brawler-page-data"
import { SITE_URL } from "@/lib/seo"
import { conditionIndex } from "@/lib/condition-pages"

export const dynamic = "force-static"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Route handlers do not share the component render cache: read the snapshot
  // once rather than reading/parsing it again for every character URL.
  const snapshot = await getSnapshot()
  const details = brawlerEntries(snapshot).map(entry => brawlerPage(snapshot, entry.slug))
  const conditions = conditionIndex(snapshot)
  return [
    ...["", "/tier", "/player", "/companion", "/brawlers", "/modes", "/maps", "/about", "/contact"].map(path => ({ url: `${SITE_URL}${path || "/"}` })),
    ...[...conditions.modes, ...conditions.maps].map(entry => ({ url: `${SITE_URL}${entry.path}`, ...(entry.updatedAt ? { lastModified: new Date(entry.updatedAt) } : {}) })),
    ...details.flatMap(data => {
      if (!data || ![data.cohorts.global, data.cohorts.gachi].some(cohort => cohort.stats?.sample_sufficient)) return []
      const dates = [data.cohorts.global.updatedAt, data.cohorts.gachi.updatedAt].filter((date): date is string => !!date && Number.isFinite(Date.parse(date))).sort((a, b) => Date.parse(b) - Date.parse(a))
      return [{ url: `${SITE_URL}/brawlers/${data.slug}`, ...(dates.length ? { lastModified: new Date(dates[0]) } : {}) }]
    }),
  ]
}
