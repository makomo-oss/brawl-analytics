import type { MetadataRoute } from "next"
import { getBrawlerEntries, getBrawlerPage } from "@/lib/server-brawler-pages"
import { SITE_URL } from "@/lib/seo"
import { getConditionIndex } from "@/lib/server-condition-pages"

export const dynamic = "force-static"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries = await getBrawlerEntries()
  const details = await Promise.all(entries.map(entry => getBrawlerPage(entry.slug)))
  const conditions = await getConditionIndex()
  return [
    ...["", "/tier", "/player", "/companion", "/brawlers", "/modes", "/maps"].map(path => ({ url: `${SITE_URL}${path || "/"}` })),
    ...[...conditions.modes, ...conditions.maps].map(entry => ({ url: `${SITE_URL}${entry.path}`, ...(entry.updatedAt ? { lastModified: new Date(entry.updatedAt) } : {}) })),
    ...details.flatMap(data => {
      if (!data || ![data.cohorts.global, data.cohorts.gachi].some(cohort => cohort.stats?.sample_sufficient)) return []
      const dates = [data.cohorts.global.updatedAt, data.cohorts.gachi.updatedAt].filter((date): date is string => !!date && Number.isFinite(Date.parse(date))).sort((a, b) => Date.parse(b) - Date.parse(a))
      return [{ url: `${SITE_URL}/brawlers/${data.slug}`, ...(dates.length ? { lastModified: new Date(dates[0]) } : {}) }]
    }),
  ]
}
