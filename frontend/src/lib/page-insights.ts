// Answer-first summaries built only from validated aggregate data. Every
// function returns null when the data cannot support a truthful sentence;
// callers then omit the block and fall back to static copy.
import type { TierListData } from "./tier-data"
import type { BrawlerPageData, Cohort } from "./brawler-page-data"
import type { ConditionPageData } from "./condition-pages"
import { getBrawlerInfo } from "./brawlers"
import { brawlerSlug } from "./brawler-paths"
import { jstDate, type JstDate } from "./dates"

export const COHORT_LABEL: Record<Cohort, string> = { global: "全体", gachi: "ガチバトル（エリート以上）" }

export interface RankedRow { id: string; name: string; slug: string; tier: string; rank: number; winRate: number; useRate: number; matches: number }
export interface ContentSummary { date: JstDate; text: string }
export interface TierSummary extends ContentSummary { cohort: Cohort; windowDays: number; analyzedMatches: number; top: RankedRow[] }

const finite = (...values: unknown[]) => values.every(value => typeof value === "number" && Number.isFinite(value))
const pct = (value: number, digits = 1) => `${value.toFixed(digits)}%`
const count = (value: number) => value.toLocaleString("ja-JP")

export function rankedRows(data: TierListData | null | undefined, nameOf: (id: string) => string = id => getBrawlerInfo(id).nameJa): RankedRow[] {
  if (!data?.tiers || !data.characters) return []
  const tierOf = new Map<string, string>()
  for (const [tier, ids] of Object.entries(data.tiers)) if (tier !== "N/A" && Array.isArray(ids)) ids.forEach(id => tierOf.set(id, tier))
  return Object.entries(data.characters).flatMap(([id, stats]) => {
    const rank = stats?.rank_position
    if (stats?.sample_sufficient !== true || !tierOf.has(id) || !finite(rank, stats.win_rate, stats.use_rate, stats.total_matches) || stats.total_matches <= 0) return []
    const name = nameOf(id)
    if (!name || name === "Unknown") return []
    return [{ id, name, slug: brawlerSlug(id), tier: tierOf.get(id)!, rank: rank as number, winRate: stats.win_rate, useRate: stats.use_rate, matches: stats.total_matches }]
  }).sort((a, b) => a.rank - b.rank || a.slug.localeCompare(b.slug))
}

export function tierSummary(data: TierListData | null | undefined, cohort: Cohort, nameOf?: (id: string) => string, scopeLabel?: string): TierSummary | null {
  const date = jstDate(data?.updated_at)
  const rows = rankedRows(data, nameOf)
  const analyzedMatches = Number(data?.metrics?.analyzed_matches)
  const windowDays = Number(data?.metrics?.analysis_window_days) || 60
  if (!date || rows.length < 3 || !finite(analyzedMatches) || analyzedMatches <= 0) return null
  const [first, second, third] = rows
  const best = rows.reduce((a, b) => b.winRate > a.winRate ? b : a)
  const text = `${date.long}時点（直近${windowDays}日・${count(analyzedMatches)}件のプレイヤー戦績）の${scopeLabel || COHORT_LABEL[cohort]}Tierスコア1位は${first.name}（Tier ${first.tier}・勝率${pct(first.winRate)}）、2位は${second.name}（Tier ${second.tier}・勝率${pct(second.winRate)}）、3位は${third.name}（Tier ${third.tier}・勝率${pct(third.winRate)}）です。`
    + (best.id !== first.id ? `集計対象のうち勝率が最も高いのは${best.name}（${pct(best.winRate)}）です。` : "")
  return { date, text, cohort, windowDays, analyzedMatches, top: rows.slice(0, 10) }
}

// The cohort a character summary describes: global when it has a judged
// tier, otherwise gachi. Never mixes the two.
export function summaryCohort(data: BrawlerPageData): Cohort | null {
  return (["global", "gachi"] as const).find(type => data.cohorts[type].stats?.sample_sufficient === true && data.cohorts[type].tier !== "N/A") || null
}

export function brawlerSummary(data: BrawlerPageData): ContentSummary | null {
  const type = summaryCohort(data)
  if (!type) return null
  const cohort = data.cohorts[type]
  const stats = cohort.stats!
  const date = jstDate(cohort.updatedAt)
  if (!date || !finite(stats.win_rate, stats.use_rate, stats.total_matches)) return null
  const rank = finite(stats.rank_position) ? `・${stats.rank_position}位` : ""
  const parts = [`${date.long}時点の${COHORT_LABEL[type]}データでは、${data.nameJa}はTier ${cohort.tier}${rank}、勝率${pct(stats.win_rate)}・使用率${pct(stats.use_rate, 2)}です（直近${cohort.windowDays}日・${count(stats.total_matches)}件のプレイヤー戦績）。`]
  const mode = bestMode(data, type)
  if (mode) parts.push(`得意なモードは${mode.label}（勝率${pct(mode.win_rate)}）`)
  const map = cohort.maps[0]
  if (map && finite(map.win_rate)) parts.push(`${mode ? "、" : ""}おすすめマップは${map.label}（勝率${pct(map.win_rate)}）`)
  if (mode || map) parts.push("です。")
  const counters = cohort.unfavorable.slice(0, 2).map(row => row.nameJa)
  if (counters.length) parts.push(`苦手な相手は${counters.join("・")}です。`)
  return { date, text: parts.join("") }
}

export function bestMode(data: BrawlerPageData, type: Cohort) {
  return data.cohorts[type].modes.filter(row => row.sample_sufficient && row.confidence_interval && finite(row.win_rate))
    .sort((a, b) => b.confidence_interval![0] - a.confidence_interval![0] || b.total_matches - a.total_matches)[0] || null
}

export function conditionCohort(data: ConditionPageData): Cohort {
  return data.cohorts.global.rows.length ? "global" : "gachi"
}

export function conditionSummary(data: ConditionPageData): ContentSummary | null {
  const type = conditionCohort(data)
  const cohort = data.cohorts[type]
  const date = jstDate(cohort.updatedAt)
  const top = cohort.rows.filter(row => row.sample_sufficient && finite(row.win_rate)).slice(0, 3)
  const total = cohort.rows.reduce((sum, row) => sum + (finite(row.total_matches) ? row.total_matches : 0), 0)
  if (!date || !top.length || total <= 0) return null
  const ranked = top.map((row, i) => `${i + 1}位は${row.nameJa}（勝率${pct(row.win_rate)}）`).join("、")
  return { date, text: `${date.long}時点の${data.entry.label}・${COHORT_LABEL[type]}データ（直近${cohort.windowDays}日・${count(total)}件のプレイヤー戦績）では、Tierスコア${ranked}です。` }
}

// Trim at a sentence end so descriptions never stop mid-number.
export function clampDescription(text: string, max = 140) {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const end = cut.lastIndexOf("。")
  return end > 40 ? cut.slice(0, end + 1) : cut.slice(0, max - 1) + "…"
}
