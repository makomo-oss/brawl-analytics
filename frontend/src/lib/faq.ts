// FAQ text is shown on the page and mirrored into FAQPage JSON-LD from the
// same items, so the two can never disagree.
import type { TierListData } from "./tier-data"
import type { BrawlerPageData } from "./brawler-page-data"
import { COHORT_LABEL, bestMode, summaryCohort, type TierSummary } from "./page-insights"

export interface FaqLink { href: string; label: string }
export interface FaqItem { question: string; answer: string; links?: FaqLink[] }

export const PLAYER_FAQ: FaqItem[] = [
  { question: "ブロスタの戦績はどうやって確認できますか？", answer: "このページでプレイヤー名かプレイヤータグ（#から始まる英数字）を入力して同期すると、公式APIからトロフィー、ガチバトルのスコア、最近のバトル履歴を取得して表示します。クラブ検索に切り替えると、クラブのメンバーも確認できます。" },
  { question: "プレイヤータグはどこで確認できますか？", answer: "ゲーム内で自分のプロフィールを開くと、名前の近くに「#」から始まるプレイヤータグが表示されます。タグがわからない場合は、プレイヤー名で検索して候補から選ぶこともできます。" },
  { question: "勝率はどのように計算していますか？", answer: "勝率は「勝ち ÷（勝ち＋負け）」で計算し、引き分けは含めません。試合数による振れを示す目安幅（Wilsonの95%区間）も表示し、10試合未満の成績は参考値として扱います。同じ条件の全体平均との差も確認できます。" },
  { question: "どの期間の戦績を分析できますか？", answer: "同期して保存した戦績を、直近7日・30日・60日から選んで、キャラ・モード・マップ別に分析できます。保存済みの戦績が多い場合は最新10,000試合までを分析し、60日より古い記録は削除されます。" },
  { question: "自動で戦績を記録できますか？", answer: "プレイヤーページで自動同期をONにすると、サイトを閉じていても一定間隔で戦績を取得して蓄積します。OFFにすると自動取得は止まります。" },
]

export const COMPANION_FAQ: FaqItem[] = [
  { question: "BAN・ピックツールの使い方は？", answer: "モード、マップ、自チーム、先攻チームを選んで「ドラフトを開始する」を押します。味方と敵のBANを入力したあと、ピック順に沿って味方・敵のキャラを選ぶと、その時点のおすすめ候補を表示します。" },
  { question: "おすすめキャラは何をもとに選んでいますか？", answer: "ガチバトル（エリート以上）の直近の対戦データをもとに、選んだマップ・モードでの強さ、すでに選ばれた敵へのカウンター、味方との相性を組み合わせて候補を並べています。" },
]

export function tierFaq(summary: TierSummary | null, data: TierListData | null | undefined): FaqItem[] {
  const metrics: Record<string, unknown> = data?.metrics || {}
  const minimum = Number(metrics.minimum_matches)
  const windowDays = Number(metrics.analysis_window_days) || 60
  const recent = Number(metrics.recent_window_days)
  const winWeight = Number(metrics.win_weight)
  const usageWeight = Number(metrics.usage_weight)
  const items: FaqItem[] = []
  if (summary) {
    const [first, second, third] = summary.top
    items.push({ question: "今、ブロスタで一番強いキャラは誰ですか？", answer: `${summary.date.long}時点の${COHORT_LABEL[summary.cohort]}Tierでは、1位が${first.name}（Tier ${first.tier}・勝率${first.winRate.toFixed(1)}%）、2位が${second.name}、3位が${third.name}です。順位は毎日の集計で変わります。`,
      links: [first, second, third].map(row => ({ href: `/brawlers/${row.slug}`, label: `${row.name}の評価` })) })
  }
  const weights = Number.isFinite(winWeight) && Number.isFinite(usageWeight) ? `勝率を${Math.round(winWeight * 100)}%、使用率を${Math.round(usageWeight * 100)}%の重みで組み合わせたスコア` : "勝率と使用率を組み合わせたスコア"
  items.push(
    { question: "Tierはどのように決めていますか？", answer: `記録された対戦データから、同じモード・マップの平均と比べた勝ちやすさを中心に、${weights}で順位を付けています。試合数が少ないキャラは評価を控えめにし${Number.isFinite(minimum) ? `、${minimum}件未満のキャラは「データ不足」としてTierを付けません` : ""}。` },
    { question: "どの期間のデータを集計していますか？", answer: `直近${windowDays}日のプレイヤー戦績を集計し${Number.isFinite(recent) ? `、特に直近${recent}日のデータを重視しています` : "ています"}。集計は1日2回（日本時間の4時ごろと16時ごろ）更新されます。` },
    { question: "全体Tierとガチバトル Tierの違いは？", answer: "全体Tierは記録されたすべての対戦が対象です。ガチバトル Tierはエリート以上のプレイヤーによるガチバトルだけを集計し、ランク帯・モード・マップ別にも絞り込めます。" },
  )
  return items
}

export function brawlerFaq(data: BrawlerPageData): FaqItem[] {
  const type = summaryCohort(data)
  const items: FaqItem[] = []
  const name = data.nameJa
  if (type) {
    const cohort = data.cohorts[type]
    const stats = cohort.stats!
    const rank = Number.isFinite(stats.rank_position) ? `（${stats.rank_position}位）` : ""
    items.push({ question: `${name}は強いですか？`, answer: `${COHORT_LABEL[type]}データでは${name}はTier ${cohort.tier}${rank}で、勝率は${stats.win_rate.toFixed(1)}%、使用率は${stats.use_rate.toFixed(2)}%です（直近${cohort.windowDays}日・${stats.total_matches.toLocaleString("ja-JP")}件のプレイヤー戦績）。`, links: [{ href: "/tier", label: "Tier表を見る" }] })
  }
  const source = type || (data.cohorts.global.stats ? "global" : "gachi")
  const cohort = data.cohorts[source]
  const counters = cohort.unfavorable.slice(0, 3)
  if (counters.length) items.push({ question: `${name}のカウンター（苦手なキャラ）は？`, answer: `${cohort.matchupScope}の対戦データでは、${counters.map(row => `${row.nameJa}（敵にいる試合の補正勝率${row.win_rate.toFixed(1)}%・${row.matches.toLocaleString("ja-JP")}件）`).join("、")}が苦手な相手です。勝率は${name}側のチーム成績です。`, links: counters.map(row => ({ href: `/brawlers/${row.slug}`, label: row.nameJa })) })
  const maps = cohort.maps.slice(0, 3)
  const mode = bestMode(data, source)
  if (maps.length) items.push({ question: `${name}のおすすめマップは？`, answer: `勝率の信頼区間の下限が高い順に、${maps.map(row => `${row.label}（勝率${row.win_rate.toFixed(1)}%）`).join("、")}がおすすめです。${mode ? `モード別では${mode.label}の成績が安定しています。` : ""}` })
  const allies = cohort.allies.slice(0, 3)
  if (allies.length) items.push({ question: `${name}と相性のいい味方は？`, answer: `味方にいると勝率が上がりやすいのは、${allies.map(row => row.nameJa).join("、")}です（${cohort.matchupScope}の対戦データ）。`, links: allies.map(row => ({ href: `/brawlers/${row.slug}`, label: row.nameJa })) })
  return items
}

export function faqNode(url: string, items: FaqItem[]) {
  if (!items.length) return null
  return { "@type": "FAQPage", "@id": `${url}#faq`, url, inLanguage: "ja", isPartOf: { "@id": url },
    mainEntity: items.map(item => ({ "@type": "Question", name: item.question, acceptedAnswer: { "@type": "Answer", text: item.answer } })) }
}
