// Data-backed titles and descriptions shared by Next metadata and the Worker
// head. Each falls back to the static copy when the data cannot support it.
import { searchCopy, brawlerSearchCopy } from "./seo"
import type { TierListData } from "./tier-data"
import type { BrawlerPageData } from "./brawler-page-data"
import { conditionCopy, type ConditionIndex, type ConditionPageData } from "./condition-pages"
import { brawlerSummary, clampDescription, conditionSummary, summaryCohort, tierSummary } from "./page-insights"
import { jstDate } from "./dates"

type Copy = { title: string; description: string }
const FRESH_MS = 7 * 24 * 60 * 60 * 1000

export const playerCopy: Copy = {
  title: "ブロスタ戦績確認ツール｜プレイヤー検索・勝率・バトル履歴",
  description: "プレイヤー名・タグからブロスタの戦績を無料検索。トロフィー、ガチバトルのスコア、最近のバトル履歴に加え、保存した戦績から直近7・30・60日の勝率をキャラ・モード・マップ別に確認できます。自動同期にも対応。",
}
export const companionCopy: Copy = searchCopy.companion

export function tierCopy(data: TierListData | null | undefined, now: number): Copy {
  const date = jstDate(data?.updated_at)
  const fresh = date && now - Date.parse(date.iso) < FRESH_MS && Date.parse(date.iso) <= now + 60 * 60 * 1000
  const summary = tierSummary(data, "global")
  const title = fresh ? `ブロスタ最強キャラランキング・ティア表【${date.short}更新】` : searchCopy.tier.title
  if (!summary) return { title, description: searchCopy.tier.description }
  const [first, second, third] = summary.top
  return { title, description: clampDescription(`${summary.date.long}更新。全体Tier1位は${first.name}（Tier ${first.tier}・勝率${first.winRate.toFixed(1)}%）、2位${second.name}、3位${third.name}。直近${summary.windowDays}日・${summary.analyzedMatches.toLocaleString("ja-JP")}件のプレイヤー戦績から勝率・使用率で算出。ガチバトル・モード・マップ別も確認できます。`, 150) }
}

export function brawlerCopy(data: BrawlerPageData): Copy {
  const base = brawlerSearchCopy(data.nameJa)
  const type = summaryCohort(data)
  const summary = brawlerSummary(data)
  if (!type || !summary) return base
  const tier = `${type === "gachi" ? "ガチTier" : "Tier"} ${data.cohorts[type].tier}`
  return { title: `${base.title}【${tier}】`, description: clampDescription(summary.text, 150) }
}

export function conditionPageCopy(data: ConditionPageData): Copy {
  const base = conditionCopy(data.entry)
  const summary = conditionSummary(data)
  if (!summary) return base
  return { title: `ブロスタ ${data.entry.label}のおすすめ最強キャラ｜勝率ランキング`, description: clampDescription(`${summary.text}全体とガチバトルのキャラ別勝率・使用率を比較できます。`, 150) }
}

export function conditionHubCopy(kind: "modes" | "maps", index?: ConditionIndex | null): Copy {
  const noun = kind === "modes" ? "モード" : "マップ"
  const total = index?.[kind]?.length || 0
  return { title: `ブロスタ ${noun}別最強キャラランキング`,
    description: total ? `ブロスタの${total}${noun === "モード" ? "モード" : "マップ"}について、おすすめキャラと勝率・使用率のランキングを全体とガチバトルの対戦データで比較できます。` : `${noun}別のキャラ勝率・使用率ランキング。` }
}
