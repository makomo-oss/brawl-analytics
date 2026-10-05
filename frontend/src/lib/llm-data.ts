import type { BrawlerPageData, CharacterStats, Cohort, PairRow, brawlerEntries } from "./brawler-page-data"
import { conditionPath, MODE_SLUGS, type ConditionIndex, type ConditionPageData } from "./condition-pages"
import { SITE_URL } from "./seo"
import { SITE_ID, PUBLISHER_ID, GAME_ID, CATALOG_ID, reference, siteNodes } from "./site-schema"
import { filterAndSortBrawlers } from "./brawler-directory"
import { translateMode } from "./translations"

export type PublicPage = { path: string } & (
  { kind: "detail"; data: BrawlerPageData } |
  { kind: "directory"; entries: ReturnType<typeof brawlerEntries> } |
  { kind: "condition"; data: ConditionPageData } |
  { kind: "conditions"; index: ConditionIndex; category: "modes" | "maps" }
)
export const dataPath = (path: string) => `/data${path}${/^\/(brawlers|modes|maps)$/.test(path) ? "/index" : ""}.json`
export const indexablePage = (page: PublicPage) => page.kind === "detail" ? Object.values(page.data.cohorts).some(cohort => cohort.stats?.sample_sufficient) : page.kind === "condition" ? Object.values(page.data.cohorts).some(cohort => cohort.rows.some(row => row.sample_sufficient)) : true
const absolute = (path: string) => `${SITE_URL}${path}`
const entityId = (path: string) => `${absolute(path)}#entity`
const datasetId = (path: string, cohort: Cohort) => `${absolute(path)}#dataset-${cohort}`
const cohortName = (cohort: Cohort) => cohort === "global" ? "全体" : "ガチバトル・エリート以上"
const round = (value: number, digits: number) => Number(value.toFixed(digits))
function metrics(stats: CharacterStats, confidence = false) {
  return { win_rate_percent: round(stats.win_rate, 1), use_rate_percent: round(stats.use_rate, 2), player_battle_records: stats.total_matches,
    sample_sufficient: stats.sample_sufficient === true,
    ...(confidence && stats.confidence_interval ? { win_rate_confidence_interval_95_percent: stats.confidence_interval.map(value => round(value, 1)) } : {}),
  }
}
function resource(path: string, name: string, identifier: string, alternateNames: string[] = []) {
  return { id: entityId(path), entity_type: path.startsWith("/brawlers/") ? "character" : path.startsWith("/modes/") ? "mode" : "map", identifier: identifier.replace(/^gachi_/, ""), name, alternate_names: [...new Set([...alternateNames, identifier.replace(/^gachi_/, "")])].filter(value => value !== name), page_url: absolute(path), data_url: absolute(dataPath(path)) }
}
function conditionResource(kind: "modes" | "maps", id: string, name: string, modeIds: string[] = []) {
  const path = kind === "maps" && !modeIds.some(mode => MODE_SLUGS[mode]) ? null : conditionPath(kind, id)
  return path ? resource(path, name, id.replace(/^gachi_/, "")) : { id: null, identifier: id, name, alternate_names: [], page_url: null, data_url: null }
}
const pair = (row: PairRow) => ({ character: resource(`/brawlers/${row.slug}`, row.nameJa, row.name, [row.name]), adjusted_win_rate_percent: round(row.win_rate, 1), player_battle_records: row.matches,
  ...(row.lift !== undefined ? { synergy_lift_percentage_points: round(row.lift, 1) } : {}),
})

// An explicit public projection: no player tags, private logs, RPC matrices, or
// unobserved equipment recommendations. Values follow the UI's precision.
export function publicData(page: PublicPage) {
  const base = { format_version: 1, page_url: absolute(page.path), data_url: absolute(dataPath(page.path)), game: { id: GAME_ID, name: "ブロスタ", alternate_name: "Brawl Stars" } }
  if (page.kind === "directory") return { ...base, kind: "character_catalog", entities: filterAndSortBrawlers(page.entries, "", "japanese", "global").map(row => ({ ...resource(`/brawlers/${row.slug}`, row.nameJa, row.name, [row.name]), dataset_ids: (["global", "gachi"] as const).filter(type => row.directoryStats[type]).map(type => datasetId(`/brawlers/${row.slug}`, type)) })) }
  if (page.kind === "conditions") return { ...base, kind: `${page.category}_catalog`, entities: page.index[page.category].map(row => ({ ...resource(row.path, row.label, row.ids.global || row.ids.gachi || row.slug), mode_ids: row.modeIds, updated_at: row.updatedAt, dataset_ids: (["global", "gachi"] as const).filter(type => row.ids[type]).map(type => datasetId(row.path, type)) })) }
  const subject = page.kind === "detail" ? resource(page.path, page.data.nameJa, page.data.name, [page.data.name]) : resource(page.path, page.data.entry.label, page.data.entry.ids.global || page.data.entry.ids.gachi || page.data.entry.slug)
  const datasets = (["global", "gachi"] as const).flatMap<Node>(type => {
    const cohort = page.data.cohorts[type]
    const common = { id: datasetId(page.path, type), cohort: { identifier: type, name: cohortName(type), minimum_rank: type === "gachi" ? "elite" : null, population: "recorded_player_battle_logs" }, updated_at: cohort.updatedAt,
      analysis_window_days: cohort.windowDays, count_unit: "player_battle_records" }
    if (page.kind === "detail") {
      const data = page.data.cohorts[type]
      if (!data.stats) return []
      return [{ ...common, statistics: { ...metrics(data.stats, true), tier: data.stats.sample_sufficient ? data.tier : null, ranking_position: data.stats.sample_sufficient ? data.stats.rank_position ?? null : null },
        modes: data.modes.map(row => ({ condition: conditionResource("modes", row.id, row.label), win_rate_percent: round(row.win_rate, 1), player_battle_records: row.total_matches, sample_sufficient: row.sample_sufficient === true })),
        recommendation_order: "descending_lower_95_percent_confidence_bound",
        recommended_maps: data.maps.map(row => ({ condition: conditionResource("maps", row.id, row.label, row.modeIds), mode_ids: row.modeIds || [], win_rate_percent: round(row.win_rate, 1), player_battle_records: row.total_matches })),
        matchups: { scope: data.matchupScope, favorable: data.favorable.map(pair), unfavorable: data.unfavorable.map(pair), allies: data.allies.map(pair) },
      }]
    }
    const data = page.data.cohorts[type]
    if (!data.rows.length) return []
    return [{ ...common, ranking_basis: "tier_score", ranking: data.rows.map((row, i) => ({ character: resource(`/brawlers/${row.slug}`, row.nameJa, row.name, [row.name]), ranking_position: row.sample_sufficient ? i + 1 : null, ...metrics(row) })) }]
  })
  return { ...base, kind: page.kind === "detail" ? "character_statistics" : `${page.data.entry.kind}_ranking`, entity: subject, datasets,
    ...(page.kind === "condition" ? { mode_ids: page.data.entry.modeIds, related_resources: page.data.related.map(row => resource(row.path, row.label, row.ids.global || row.ids.gachi || row.slug)) } : {}),
  }
}

type Node = Record<string, unknown>
export function pageSchema(page: PublicPage, base: { "@graph"?: Node[] } | Node, includeSite = false) {
  const baseNodes: Node[] = Array.isArray(base["@graph"]) ? base["@graph"] as Node[] : [base]
  const url = absolute(page.path)
  const data = publicData(page)
  const nodes: Node[] = [...(includeSite ? siteNodes() : []), ...baseNodes.map(node => node["@id"] === url ? { ...node, isPartOf: reference(SITE_ID) } : node)]
  if (page.kind === "detail" || page.kind === "condition") {
    const name = page.kind === "detail" ? page.data.nameJa : page.data.entry.label
    const identifier = (page.kind === "detail" ? page.data.name : page.data.entry.ids.global || page.data.entry.ids.gachi || page.data.entry.slug).replace(/^gachi_/, "")
    const entity: Node = { "@type": "Thing", "@id": entityId(page.path), name, identifier, url, subjectOf: reference(url) }
    if (identifier !== name) entity.alternateName = identifier
    if (page.kind === "detail" && page.data.imageUrl) entity.image = page.data.imageUrl
    nodes.push(entity)
    const datasets: Node[] = (["global", "gachi"] as const).flatMap(type => {
      const cohort = page.data.cohorts[type]
      if (page.kind === "detail" ? !page.data.cohorts[type].stats : !page.data.cohorts[type].rows.length) return []
      const dataset: Node = { "@type": "Dataset", "@id": datasetId(page.path, type), name: `${name}・${cohortName(type)}の対戦統計`, url,
        description: `${name}の${cohortName(type)}における直近${cohort.windowDays}日のキャラ分析。勝率・使用率・プレイヤーごとの対戦件数を、記録された戦績から集計したデータです。`,
        inLanguage: "ja", isAccessibleForFree: true, creator: reference(PUBLISHER_ID), includedInDataCatalog: reference(CATALOG_ID),
        about: [reference(GAME_ID), reference(entityId(page.path)), { "@type": "DefinedTerm", termCode: type, name: cohortName(type) }],
        measurementTechnique: "記録されたプレイヤーごとの対戦ログの集計",
        variableMeasured: [{ "@type": "PropertyValue", propertyID: "win_rate_percent", name: "勝率", unitText: "%" }, { "@type": "PropertyValue", propertyID: "use_rate_percent", name: "使用率", unitText: "%" }, { "@type": "PropertyValue", propertyID: "player_battle_records", name: "集計件数", unitText: "プレイヤーごとの対戦件数" }],
        distribution: { "@type": "DataDownload", encodingFormat: "application/json", contentUrl: absolute(dataPath(page.path)) },
        ...(cohort.updatedAt ? { dateModified: cohort.updatedAt } : {}),
      }
      if (page.kind === "detail") {
        const current = page.data.cohorts[type]
        dataset.mentions = [...current.modes.map(row => conditionResource("modes", row.id, row.label)), ...current.maps.map(row => conditionResource("maps", row.id, row.label, row.modeIds))].map(row => ({ "@type": "Thing", ...(row.id ? { "@id": row.id } : {}), name: row.name, identifier: row.identifier }))
      }
      if (page.kind === "condition" && page.data.entry.kind === "maps") dataset.about = [...dataset.about as Node[], ...page.data.entry.modeIds.map(id => ({ "@type": "Thing", "@id": entityId(conditionPath("modes", id)!), name: translateMode(id), identifier: id }))]
      return [dataset]
    })
    const collection = nodes.find(node => node["@id"] === url)
    if (collection) { collection.about = reference(entityId(page.path)); collection.hasPart = datasets.map(node => reference(String(node["@id"]))) }
    else nodes.push({ "@type": "WebPage", "@id": url, url, name: `${name}の勝率・相性`, isPartOf: reference(SITE_ID), about: reference(GAME_ID), mainEntity: reference(entityId(page.path)), hasPart: datasets.map(node => reference(String(node["@id"]))) })
    nodes.push(...datasets)
  } else if ("entities" in data) {
    if (page.kind === "directory") {
      const collection = nodes.find(node => node["@id"] === url)
      if (collection) collection.mainEntity = { "@type": "ItemList", itemListElement: data.entities.map((row, i) => ({ "@type": "ListItem", position: i + 1, name: row.name, url: row.page_url, item: reference(row.id) })) }
    }
    nodes.push(...data.entities.map(row => ({ "@type": "Thing", "@id": row.id, name: row.name, identifier: row.identifier, url: row.page_url, ...(row.alternate_names.length ? { alternateName: row.alternate_names } : {}) })))
  }
  return { "@context": "https://schema.org", "@graph": nodes }
}

export function publicCatalog(pages: PublicPage[]) {
  const entities = pages.flatMap(page => { const data = publicData(page); return "entities" in data ? data.entities : [] })
  return { format_version: 1, data_url: absolute("/data/index.json"), entities,
    schema: { "@context": "https://schema.org", "@graph": [...siteNodes(), { "@type": "DataCatalog", "@id": CATALOG_ID, name: "ブロラボ対戦統計カタログ", url: absolute("/data/catalog.jsonld"), publisher: reference(PUBLISHER_ID), dataset: entities.flatMap(row => row.dataset_ids.map(reference)) }] },
  }
}
