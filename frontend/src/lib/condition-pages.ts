import { brawlerEntries, type BrawlerSnapshot, type CharacterStats, type Cohort } from "./brawler-page-data"
import { translateMap, translateMode } from "./translations"
import { SITE_URL } from "./seo"

export const MODE_SLUGS: Record<string, string> = {
  soloShowdown: "solo-showdown", duoShowdown: "duo-showdown", brawlBall: "brawl-ball",
  hotZone: "hot-zone", knockout: "knockout", gemGrab: "gem-grab", heist: "heist", bounty: "bounty",
}
export const mapSlug = (id: string) => id.replace(/^gachi_/, "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
export function conditionPath(kind: "modes" | "maps", id: string) {
  const slug = kind === "modes" ? MODE_SLUGS[id] : mapSlug(id)
  return slug ? `/${kind}/${slug}` : null
}
export interface ConditionEntry {
  kind: "modes" | "maps"; slug: string; label: string; path: string; modeIds: string[]
  ids: Partial<Record<Cohort, string>>; updatedAt: string | null
}
export interface ConditionIndex { modes: ConditionEntry[]; maps: ConditionEntry[] }
type RankingRow = CharacterStats & { name: string; slug: string; nameJa: string; imageUrl: string }
export interface ConditionPageData {
  entry: ConditionEntry; related: ConditionEntry[]
  cohorts: Record<Cohort, { rows: RankingRow[]; updatedAt: string | null }>
}
export const normalizeDate = (date: string | null) => {
  if (!date) return null
  const stamp = Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(date) ? date : `${date}Z`)
  return Number.isFinite(stamp) ? new Date(stamp).toISOString() : null
}

// One canonical URL combines the two cohorts. No rank/filter URL combinations.
export function conditionIndex(snapshot: BrawlerSnapshot): ConditionIndex {
  const result: ConditionIndex = { modes: [], maps: [] }
  for (const kind of ["modes", "maps"] as const) {
    const entries = new Map<string, ConditionEntry>()
    for (const type of ["global", "gachi"] as const) {
      for (const [id, rows] of Object.entries(snapshot.contexts[type][kind])) {
        const modeIds = kind === "modes" ? [id] : snapshot.mapModes?.[type]?.[id] || []
        if (!modeIds.some(mode => MODE_SLUGS[mode]) || !Object.values(rows).some(row => row.total_matches > 0)) continue
        const path = conditionPath(kind, id)
        if (!path) continue
        const existing = entries.get(path)
        if (existing?.ids[type] && existing.ids[type] !== id) throw new Error(`Duplicate condition URL: ${path}`)
        const entry = existing || { kind, path, slug: path.split("/").pop()!, label: kind === "modes" ? translateMode(id) : translateMap(id), ids: {}, modeIds: [], updatedAt: null }
        entry.ids[type] = id
        entry.modeIds = [...new Set([...entry.modeIds, ...modeIds])].filter(mode => MODE_SLUGS[mode])
        const date = normalizeDate(snapshot.contextUpdatedAt?.[type]?.[kind]?.[id] ?? snapshot.overview[type].updated_at)
        if (date && (!entry.updatedAt || date > entry.updatedAt)) entry.updatedAt = date
        entries.set(path, entry)
      }
    }
    result[kind] = [...entries.values()].filter(entry => (["global", "gachi"] as const).some(type => {
      const id = entry.ids[type]
      return id && Object.values(snapshot.contexts[type][kind][id]).some(row => row.sample_sufficient && row.total_matches > 0)
    })).sort((a, b) => a.label.localeCompare(b.label, "ja"))
  }
  return result
}

export function conditionPage(snapshot: BrawlerSnapshot, entry: ConditionEntry, index: ConditionIndex): ConditionPageData {
  const catalog = brawlerEntries(snapshot)
  const cohort = (type: Cohort) => {
    const id = entry.ids[type]
    const stats = id ? snapshot.contexts[type][entry.kind][id] || {} : {}
    const rows = catalog.flatMap(character => stats[character.name]?.total_matches > 0 ? [{ ...stats[character.name], name: character.name, slug: character.slug, nameJa: character.nameJa, imageUrl: character.imageUrl }] : [])
      .sort((a, b) => Number(!!b.sample_sufficient) - Number(!!a.sample_sufficient) || b.score - a.score || b.total_matches - a.total_matches || a.slug.localeCompare(b.slug))
    return { rows, updatedAt: id ? normalizeDate(snapshot.contextUpdatedAt?.[type]?.[entry.kind]?.[id] ?? snapshot.overview[type].updated_at) : null }
  }
  return { entry, cohorts: { global: cohort("global"), gachi: cohort("gachi") }, related: entry.kind === "modes"
    ? index.maps.filter(map => map.modeIds.some(id => entry.modeIds.includes(id)))
    : index.modes.filter(mode => mode.modeIds.some(id => entry.modeIds.includes(id))) }
}

export const conditionCopy = (entry: ConditionEntry) => ({ title: `ブロスタ ${entry.label}の最強キャラ・勝率`, description: `${entry.label}のキャラ別勝率・使用率・ランキング。全体とガチバトルの実際の対戦データで比較。` })
export const conditionBreadcrumbs = (entry?: ConditionEntry, kind: "modes" | "maps" = entry?.kind || "modes") => [
  { name: "ホーム", path: "/" }, { name: "Tier表", path: "/tier" },
  { name: kind === "modes" ? "モード一覧" : "マップ一覧", path: `/${kind}` },
  ...(entry ? [{ name: entry.label, path: entry.path }] : []),
]
export function collectionSchema(path: string, name: string, breadcrumbs: { name: string; path: string }[], items: { name: string; path: string }[]) {
  return { "@context": "https://schema.org", "@graph": [
    { "@type": "BreadcrumbList", itemListElement: breadcrumbs.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, item: `${SITE_URL}${item.path}` })) },
    { "@type": "CollectionPage", "@id": `${SITE_URL}${path}`, url: `${SITE_URL}${path}`, name, inLanguage: "ja", mainEntity: { "@type": "ItemList", itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, url: `${SITE_URL}${item.path}` })) } },
  ] }
}
export function conditionSchema(data: ConditionPageData) {
  // The structured list follows the default visible cohort and table order.
  const rows = data.cohorts.global.rows.length ? data.cohorts.global.rows : data.cohorts.gachi.rows
  return collectionSchema(data.entry.path, conditionCopy(data.entry).title, conditionBreadcrumbs(data.entry), rows.map(row => ({ name: row.nameJa, path: `/brawlers/${row.slug}` })))
}
