// /llms.txt and /llms-full.txt: a plain Markdown guide for AI assistants,
// rendered from the same validated snapshot as the sitemap. Sections whose
// data is missing are omitted; numbers are never invented.
import { brawlerEntries, type BrawlerSnapshot, type Cohort } from "./brawler-page-data"
import type { ConditionIndex } from "./condition-pages"
import { SITE_URL } from "./seo"
import { SITE_SECTIONS } from "./site-sections"
import { COHORT_LABEL, tierSummary } from "./page-insights"
import { jstDate } from "./dates"
import { translateMode } from "./translations"

const md = (text: string) => text.replace(/[[\]]/g, "")
const pct = (value: number, digits = 1) => `${value.toFixed(digits)}%`

function header(index: BrawlerSnapshot) {
  const dates = (["global", "gachi"] as const).flatMap(type => {
    const date = jstDate(index.overview[type].updated_at)
    return date ? [`${COHORT_LABEL[type]}: ${date.long}`] : []
  })
  return [
    "# ブロラボ（Brawl Lab）",
    "",
    "> ブロスタ（Brawl Stars）の非公式・無料の分析ツールです。Brawl Stars公式APIの対戦記録（直近60日）をもとに、最強キャラのTier表、キャラ・モード・マップ別の勝率と使用率、キャラ同士の相性、ガチバトルのBAN・ピック候補、プレイヤーの戦績検索を提供します。日本語サイトです。",
    "",
    ...(dates.length ? [`最終集計: ${dates.join(" / ")}（集計は1日2回更新）`, ""] : []),
    "## 主要ページ",
    "",
    ...SITE_SECTIONS.map(section => `- [${section.label}](${SITE_URL}${section.path}): ${section.description}`),
    "",
  ]
}

function ranking(index: BrawlerSnapshot, type: Cohort, limit: number) {
  const summary = tierSummary(index.overview[type], type)
  if (!summary) return []
  return [
    `## ${COHORT_LABEL[type]}Tier 上位${Math.min(limit, summary.top.length)}キャラ（${summary.date.long}時点）`,
    "",
    ...summary.top.slice(0, limit).map(row => `${row.rank}. [${md(row.name)}](${SITE_URL}/brawlers/${row.slug}): Tier ${row.tier}、勝率${pct(row.winRate)}、使用率${pct(row.useRate, 2)}、${row.matches.toLocaleString("ja-JP")}件`),
    "",
  ]
}

const footer = [
  "## 主な機能とよくある質問（要点）",
  "",
  "- 戦績確認: 登録不要・無料でプレイヤー名やタグからトロフィー、ガチバトルランク、バトル履歴、期間別（直近7・30・60日）のキャラ・モード・マップ別成績を確認できます。非公開の内部レートは公式APIに存在しないため非対応です。",
  "- Tier算出: 直近60日（直近30日重視）の対戦記録をもとに、モード・マップ平均比の勝ちやすさ（70%）と使用率（30%）のスコアで評価します。",
  "- BAN・ピック提案: ガチバトル（エリート以上）の対戦データから、マップ適性・モード適性・敵へのカウンター・味方シナジーを組み合わせて6BANおよび1-2-2-1順のピック候補を提案します。",
  "",
  "## データと集計方法",
  "",
  `- [集計方法・運営情報](${SITE_URL}/about): データの出典、Tierの決め方、全体とガチバトルの違い、更新頻度`,
  `- [データ一覧（JSON）](${SITE_URL}/data/index.json): キャラ・モード・マップごとの統計JSONへのリンク`,
  `- [データカタログ（JSON-LD）](${SITE_URL}/data/catalog.jsonld)`,
  `- [全キャラの要約](${SITE_URL}/llms-full.txt)`,
  "- 件数は「プレイヤーごとの対戦件数」です。「全体」は記録されたすべての対戦、「ガチバトル（エリート以上）」はエリート以上のガチバトルだけを集計し、2つは混ぜていません。",
  "- 20件未満のキャラはTierを付けていません。順位と勝率は集計のたびに変わります。",
  "",
  "## 引用について",
  "",
  "紹介・引用する場合は「ブロラボ（https://brawl-lab.sozai-hub.com）」と集計日時を記載してください。このサイトは非公式であり、Supercellによって承認されたものではありません。",
  "",
]

export function llmsTxt(index: BrawlerSnapshot) {
  return [...header(index), ...ranking(index, "global", 10), ...ranking(index, "gachi", 5), ...footer].join("\n")
}

export function llmsFullTxt(index: BrawlerSnapshot, conditions: ConditionIndex) {
  const stat = (type: Cohort, name: string) => {
    const stats = index.overview[type].characters[name]
    if (!stats || stats.sample_sufficient !== true || ![stats.win_rate, stats.use_rate, stats.total_matches].every(Number.isFinite)) return null
    const tier = Object.entries(index.overview[type].tiers).find(([, names]) => names.includes(name))?.[0]
    return `${type === "global" ? "全体" : "ガチ"} ${tier && tier !== "N/A" ? `Tier ${tier}・` : ""}勝率${pct(stats.win_rate)}・使用率${pct(stats.use_rate, 2)}・${stats.total_matches.toLocaleString("ja-JP")}件`
  }
  const characters = brawlerEntries(index).flatMap(entry => {
    const parts = (["global", "gachi"] as const).map(type => stat(type, entry.name)).filter(Boolean)
    const alias = entry.name && entry.name.toLowerCase() !== entry.nameJa.toLowerCase() ? ` (${md(entry.name)})` : ""
    return parts.length ? [`- [${md(entry.nameJa)}](${SITE_URL}/brawlers/${entry.slug})${alias}: ${parts.join(" ／ ")}`] : []
  })
  const list = (kind: "modes" | "maps") => conditions[kind].map(entry => {
    const modes = kind === "maps" && entry.modeIds.length ? `（${entry.modeIds.map(translateMode).join("・")}）` : ""
    return `- [${md(entry.label)}](${SITE_URL}${entry.path})${modes}`
  })
  return [
    ...header(index), ...ranking(index, "global", 10), ...ranking(index, "gachi", 10),
    ...(characters.length ? ["## 全キャラの統計", "", ...characters, ""] : []),
    ...(conditions.modes.length ? ["## モード別ランキング", "", ...list("modes"), ""] : []),
    ...(conditions.maps.length ? ["## マップ別ランキング", "", ...list("maps"), ""] : []),
    ...footer,
  ].join("\n")
}
