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
  title: "ブロスタ戦績検索・勝率確認ツール｜プレイヤー名・タグで無料分析",
  description: "登録不要・無料。ブロスタのプレイヤー名やタグから戦績・勝率・トロフィー・ガチバトル成績・バトル履歴を即確認。戦績の見方や直近7・30・60日のキャラ・モード別勝率分析、クラブ検索、自動同期に対応。",
}
export const companionCopy: Copy = searchCopy.companion

function isFresh(iso: string | undefined, now: number) {
  if (!iso) return false
  const stamp = Date.parse(iso)
  return Number.isFinite(stamp) && now - stamp < FRESH_MS && stamp <= now + 60 * 60 * 1000
}

export function tierCopy(data: TierListData | null | undefined, now: number, gachiData?: TierListData | null): Copy {
  const date = jstDate(data?.updated_at)
  const fresh = date && isFresh(date.iso, now)
  const summary = tierSummary(data, "global")
  const title = fresh ? `ブロスタ現環境最強キャラランキング・ティア表【${date.short}更新】` : searchCopy.tier.title
  if (!summary) return { title, description: searchCopy.tier.description }
  const [first, second, third] = summary.top
  const gachiTop = tierSummary(gachiData, "gachi")?.top[0]
  const gachiText = gachiTop ? `ガチバトル1位は${gachiTop.name}。` : ""
  return { title, description: clampDescription(`${summary.date.long}更新。全体Tier1位は${first.name}（Tier ${first.tier}・勝率${first.winRate.toFixed(1)}%）、2位${second.name}、3位${third.name}。${gachiText}直近${summary.windowDays}日・${summary.analyzedMatches.toLocaleString("ja-JP")}件の対戦データから勝率・使用率で算出。`, 150) }
}

export function brawlerCopy(data: BrawlerPageData): Copy {
  const base = brawlerSearchCopy(data.nameJa)
  const type = summaryCohort(data)
  const summary = brawlerSummary(data)
  if (!type || !summary) return base
  const tier = `${type === "gachi" ? "ガチTier" : "Tier"} ${data.cohorts[type].tier}`
  return { title: `${base.title}【${tier}】`, description: clampDescription(summary.text, 150) }
}

export function conditionPageCopy(data: ConditionPageData, now = Date.now()): Copy {
  const base = conditionCopy(data.entry)
  const summary = conditionSummary(data)
  if (!summary) return base
  const fresh = isFresh(summary.date.iso, now)
  const title = data.entry.kind === "modes"
    ? (fresh ? `ブロスタ ${data.entry.label}最強キャラランキング【${summary.date.short}更新】` : `ブロスタ ${data.entry.label}最強キャラランキング｜勝率・おすすめ`)
    : (fresh ? `ブロスタ ${data.entry.label}最強キャラ・おすすめ編成【${summary.date.short}更新】` : `ブロスタ ${data.entry.label}最強キャラ・おすすめ編成｜勝率ランキング`)
  return { title, description: clampDescription(`${summary.text}全体とガチバトルの勝率・使用率を比較できます。`, 150) }
}

export function conditionHubCopy(kind: "modes" | "maps", index?: ConditionIndex | null): Copy {
  const total = index?.[kind]?.length || 0
  if (kind === "maps") {
    return {
      title: "ブロスタ マップ・ステージ別最強キャラランキング",
      description: total
        ? `ブロスタの全${total}マップ（ステージ）について、全体とガチバトルのおすすめ最強キャラ・勝率・使用率ランキングを対戦データで比較できます。`
        : "マップ・ステージ別のキャラ勝率・使用率ランキング。",
    }
  }
  return {
    title: "ブロスタ モード別最強キャラランキング｜全モード勝率比較",
    description: total
      ? `ブロスタの全${total}モード（ソロバトルロイヤル・ブロストライカー・ノックアウト等）について、全体とガチバトルの最強キャラ・勝率・使用率を比較できます。`
      : "モード別のキャラ勝率・使用率ランキング。",
  }
}
