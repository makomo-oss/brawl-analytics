import { canonicalBrawlerName, brawlerSlug } from "./brawler-paths"
import { getBrawlerInfo } from "./brawlers"
import type { TierListData } from "./tier-data"
import { translateMap, translateMode } from "./translations"

export type Cohort = "global" | "gachi"
const MAIN_MODES = new Set(["soloShowdown", "duoShowdown", "brawlBall", "hotZone", "knockout", "gemGrab", "heist", "bounty"])
export interface CharacterStats {
  score: number; win_rate: number; use_rate: number; total_matches: number
  rank_position?: number; sample_sufficient?: boolean
  confidence_interval?: [number, number]; adjusted_win_rate?: number
}
interface Pair { brawler: string; win_rate: number; matches: number }
interface CharacterDetail extends CharacterStats {
  kamo: Pair[]; tenteki: Pair[]; kamo_scope?: string; tenteki_scope?: string
  synergies: Record<string, { win_rate: number; lift: number; matches: number }>
}
export interface BrawlerSnapshot {
  catalog: { name: string; nameJa: string; imageUrl: string }[]
  overview: Record<Cohort, TierListData>
  details: Record<Cohort, Record<string, CharacterDetail>>
  contexts: Record<Cohort, Record<"modes" | "maps", Record<string, Record<string, CharacterStats>>>>
  mapModes?: Record<Cohort, Record<string, string[]>>
}
export interface ConditionRow extends CharacterStats { id: string; label: string; modeIds?: string[] }
export interface PairRow { name: string; slug: string; nameJa: string; imageUrl: string; win_rate: number; matches: number; lift?: number }
export interface CohortData {
  stats: CharacterStats | null; tier: string; updatedAt: string | null; updatedLabel: string; windowDays: number
  modes: ConditionRow[]; maps: ConditionRow[]
  favorable: PairRow[]; unfavorable: PairRow[]; allies: PairRow[]
  matchupScope: string
}
export interface BrawlerPageData {
  name: string; slug: string; nameJa: string; imageUrl: string
  cohorts: Record<Cohort, CohortData>
}

export function brawlerEntries(snapshot: BrawlerSnapshot) {
  const names = [...new Set([...Object.keys(snapshot.overview.global.characters), ...Object.keys(snapshot.overview.gachi.characters)])]
  const entries = names.filter(name => ["global", "gachi"].some(type => {
    const stats = snapshot.overview[type as Cohort].characters[name]
    return stats && stats.total_matches > 0
  })).map(name => {
    const info = getBrawlerInfo(canonicalBrawlerName(name))
    const live = snapshot.catalog.find(row => brawlerSlug(row.name) === brawlerSlug(name))
    const directoryStats = (type: Cohort) => {
      const stats = snapshot.overview[type].characters[name]
      return stats?.total_matches > 0 ? {
        win_rate: stats.win_rate, use_rate: stats.use_rate, total_matches: stats.total_matches,
        sample_sufficient: stats.sample_sufficient === true,
      } : null
    }
    return { name, slug: brawlerSlug(name), nameJa: live?.nameJa || info.nameJa, imageUrl: live?.imageUrl || info.imageUrl,
      directoryStats: { global: directoryStats("global"), gachi: directoryStats("gachi") },
    }
  })
  if (entries.some(entry => !entry.slug) || new Set(entries.map(entry => entry.slug)).size !== entries.length) throw new Error("Invalid or duplicate character URLs")
  return entries.sort((a, b) => a.slug.localeCompare(b.slug))
}

export function brawlerPage(snapshot: BrawlerSnapshot, slug: string): BrawlerPageData | null {
  const entries = brawlerEntries(snapshot)
  const entry = entries.find(entry => entry.slug === slug)
  if (!entry) return null
  function pairs(rows: Pair[]): PairRow[] {
    return rows.flatMap(row => {
      const target = entries.find(entry => entry.slug === brawlerSlug(row.brawler))
      return target ? [{ name: target.name, slug: target.slug, nameJa: target.nameJa, imageUrl: target.imageUrl, win_rate: row.win_rate, matches: row.matches }] : []
    })
  }
  function cohort(type: Cohort): CohortData {
    const overview = snapshot.overview[type]
    const stats = overview.characters[entry!.name] as CharacterStats | undefined
    const detail = snapshot.details[type][entry!.name]
    // Older aggregate rows omit the UTC suffix. Normalize on the server so
    // deployment and browser timezones cannot change dates during hydration.
    const rawDate = overview.updated_at
    const timestamp = rawDate ? Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(rawDate) ? rawDate : `${rawDate}Z`) : NaN
    const updatedAt = Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
    const conditions = (kind: "modes" | "maps") => Object.entries(snapshot.contexts[type][kind]).flatMap(([id, characters]) => {
      const stats = characters[entry!.name]
      return stats?.total_matches > 0 ? [{ ...stats, id, label: kind === "modes" ? translateMode(id) : translateMap(id),
        ...(kind === "maps" ? { modeIds: snapshot.mapModes?.[type]?.[id] || [] } : {}),
      }] : []
    })
    return {
      stats: stats?.total_matches ? stats : null,
      tier: Object.entries(overview.tiers).find(([, names]) => names.includes(entry!.name))?.[0] || "N/A",
      updatedAt,
      updatedLabel: updatedAt ? new Date(updatedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "—",
      windowDays: Number(overview.metrics.analysis_window_days) || 60,
      modes: conditions("modes").filter(row => MAIN_MODES.has(row.id)).sort((a, b) => b.total_matches - a.total_matches),
      // Use the lower confidence bound to avoid recommending tiny, lucky samples.
      maps: conditions("maps").filter(row => row.sample_sufficient && row.confidence_interval)
        .sort((a, b) => b.confidence_interval![0] - a.confidence_interval![0] || b.total_matches - a.total_matches).slice(0, 5),
      favorable: pairs(detail?.kamo || []), unfavorable: pairs(detail?.tenteki || []),
      allies: Object.entries(detail?.synergies || {}).filter(([, row]) => row.lift > 0)
        .sort(([, a], [, b]) => b.lift - a.lift || b.matches - a.matches).slice(0, 5)
        .flatMap(([brawler, row]) => pairs([{ brawler, ...row }]).map(pair => ({ ...pair, lift: row.lift }))),
      matchupScope: type === "global" ? "全体Tierの3対3" : "ガチバトル・エリート以上",
    }
  }
  return { ...entry, cohorts: { global: cohort("global"), gachi: cohort("gachi") } }
}
