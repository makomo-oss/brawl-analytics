// FAQ text is shown on the page and mirrored into FAQPage JSON-LD from the
// same items, so the two can never disagree.
import type { TierListData } from "./tier-data"
import type { BrawlerPageData } from "./brawler-page-data"
import { conditionPath, type ConditionPageData } from "./condition-pages"
import { translateMode } from "./translations"
import { COHORT_LABEL, bestMode, conditionCohort, summaryCohort, type TierSummary } from "./page-insights"

export interface FaqLink { href: string; label: string }
export interface FaqItem { question: string; answer: string; links?: FaqLink[] }

export const PLAYER_FAQ: FaqItem[] = [
  { question: "ブロスタの戦績はどうやって確認できますか？", answer: "このページでプレイヤー名かプレイヤータグ（#から始まる英数字）を入力して検索すると、登録不要・無料で公式APIからトロフィー、ガチバトルのスコア、最近のバトル履歴を取得して表示します。クラブ検索に切り替えると、クラブのメンバーも確認できます。" },
  { question: "ブロスタの戦績の見方・確認できる項目は？", answer: "検索結果では現在のトロフィー、最高トロフィー、ガチバトルの現在・最高ランク、直近のバトル履歴、キャラ別の勝率・トロフィー、モード・マップ別の勝率を確認できます。戦績を同期すると直近7・30・60日の勝率推移や全体平均との差も比較できます。" },
  { question: "プレイヤータグはどこで確認できますか？", answer: "ゲーム内で自分のプロフィールを開くと、名前の近くに「#」から始まるプレイヤータグが表示されます。タグがわからない場合は、プレイヤー名で検索して候補から選ぶこともできます。" },
  { question: "勝率はどのように計算していますか？", answer: "勝率は「勝ち ÷（勝ち＋負け）」で計算し、引き分けは含めません。試合数による振れを示す目安幅（Wilsonの95%区間）も表示し、10試合未満の成績は参考値として扱います。同じ条件の全体平均との差も確認できます。" },
  { question: "ブロスタの内部レートは確認できますか？", answer: "Brawl Stars公式APIでは非公開の内部レート（MMR）自体は提供されていないため、直接の数値確認はできません。ブロラボでは代わりにガチバトルの現在・最高ランク、トロフィー推移、直近の勝率と全体平均差から実力の傾向を確認できます。" },
  { question: "どの期間の戦績を分析できますか？", answer: "同期して保存した戦績を、直近7日・30日・60日から選んで、キャラ・モード・マップ別に分析できます。保存済みの戦績が多い場合は最新10,000試合までを分析し、60日より古い記録は削除されます。" },
  { question: "自動で戦績を記録できますか？", answer: "プレイヤーページで自動同期をONにすると、サイトを閉じていても一定間隔で戦績を取得して蓄積します。OFFにすると自動取得は止まります。" },
]

export const COMPANION_FAQ: FaqItem[] = [
  { question: "BAN・ピックツールの使い方は？", answer: "モード、マップ、自チーム、先攻チームを選んで「ドラフトを開始する」を押します。味方と敵のBANを入力したあと、ピック順に沿って味方・敵のキャラを選ぶと、その時点のおすすめ候補を表示します。" },
  { question: "おすすめキャラは何をもとに選んでいますか？", answer: "ガチバトル（エリート以上）の直近の対戦データをもとに、選んだマップ・モードでの強さ、すでに選ばれた敵へのカウンター、味方との相性を組み合わせて候補を並べています。" },
  { question: "先攻・後攻のピック順（1-2-2-1）や6BANに対応していますか？", answer: "はい。味方3体・敵3体のBAN入力と、先攻・後攻に応じた1-2-2-1順のピック進行に対応しています。途中で1つ戻す・リセットもでき、完了後は編成の勝率予測も表示します。" },
  { question: "無料で登録なしで使えますか？", answer: "はい。アカウント登録やログインは不要で、スマートフォン・PCのブラウザーからすべての機能を無料で利用できます。" },
]

export function tierFaq(summary: TierSummary | null, data: TierListData | null | undefined, gachiSummary: TierSummary | null = null): FaqItem[] {
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
  if (gachiSummary && gachiSummary.top.length >= 3) {
    const [first, second, third] = gachiSummary.top
    items.push({
      question: "現環境のガチバトル（エリート以上）で最強のキャラは？",
      answer: `${gachiSummary.date.long}時点の${COHORT_LABEL.gachi}Tierでは、1位が${first.name}（Tier ${first.tier}・勝率${first.winRate.toFixed(1)}%）、2位が${second.name}、3位が${third.name}です。マップ別の編成候補はBAN・ピックツールでも確認できます。`,
      links: [...[first, second, third].map(row => ({ href: `/brawlers/${row.slug}`, label: `${row.name}の評価` })), { href: "/companion", label: "BAN・ピックツール" }],
    })
  }
  const weights = Number.isFinite(winWeight) && Number.isFinite(usageWeight) ? `勝率を${Math.round(winWeight * 100)}%、使用率を${Math.round(usageWeight * 100)}%の重みで組み合わせたスコア` : "勝率と使用率を組み合わせたスコア"
  items.push(
    { question: "Tierはどのように決めていますか？", answer: `記録された対戦データから、同じモード・マップの平均と比べた勝ちやすさを中心に、${weights}で順位を付けています。試合数が少ないキャラは評価を控えめにし${Number.isFinite(minimum) ? `、${minimum}件未満のキャラは「データ不足」としてTierを付けません` : ""}。` },
    { question: "どの期間のデータを集計していますか？", answer: `直近${windowDays}日のプレイヤー戦績を集計し${Number.isFinite(recent) ? `、特に直近${recent}日のデータを重視しています` : "ています"}。集計は1日2回（日本時間の4時ごろと16時ごろ）更新されます。` },
    { question: "全体Tierとガチバトル Tierの違いは？", answer: "全体Tierは記録されたすべての対戦が対象です。ガチバトル Tierはエリート以上のプレイヤーによるガチバトルだけを集計し、ランク帯・モード・マップ別にも絞り込めます。" },
  )
  return items
}

export function conditionFaq(data: ConditionPageData): FaqItem[] {
  const items: FaqItem[] = []
  const label = data.entry.label
  const primary = conditionCohort(data)
  const topOf = (type: "global" | "gachi") => data.cohorts[type].rows.filter(row => row.sample_sufficient && Number.isFinite(row.win_rate)).slice(0, 3)
  const primaryTop = topOf(primary)
  if (primaryTop.length) {
    items.push({
      question: `${label}の最強キャラは誰ですか？`,
      answer: `${COHORT_LABEL[primary]}の対戦データでは、${primaryTop.map((row, i) => `${i + 1}位が${row.nameJa}（勝率${row.win_rate.toFixed(1)}%・${row.total_matches.toLocaleString("ja-JP")}件）`).join("、")}です。順位は1日2回の集計で更新されます。`,
      links: primaryTop.map(row => ({ href: `/brawlers/${row.slug}`, label: `${row.nameJa}の評価` })),
    })
  }
  if (primary === "global") {
    const gachiTop = topOf("gachi")
    if (gachiTop.length) {
      items.push({
        question: `${label}のガチバトルおすすめキャラは？`,
        answer: `${COHORT_LABEL.gachi}では、${gachiTop.map((row, i) => `${i + 1}位が${row.nameJa}（勝率${row.win_rate.toFixed(1)}%）`).join("、")}が上位です。BAN・ピック時の対面相性や味方シナジーはピックツールで確認できます。`,
        links: [...gachiTop.map(row => ({ href: `/brawlers/${row.slug}`, label: row.nameJa })), { href: "/companion", label: "BAN・ピックツール" }],
      })
    }
  }
  if (data.entry.kind === "maps" && data.entry.modeIds.length) {
    const modeLinks = data.entry.modeIds.flatMap(id => {
      const href = conditionPath("modes", id)
      return href ? [{ href, label: `${translateMode(id)}のランキング` }] : []
    })
    items.push({
      question: `${label}はどのモードのマップですか？`,
      answer: `${label}は${data.entry.modeIds.map(translateMode).join("・")}のマップです。全体とガチバトル（エリート以上）のそれぞれでキャラ別勝率・使用率を比較できます。`,
      links: [...modeLinks, { href: "/maps", label: "マップ一覧" }],
    })
  }
  const windowDays = data.cohorts[primary].windowDays || 60
  items.push({
    question: `${label}のランキングはどのように集計していますか？`,
    answer: `Brawl Stars公式APIの直近${windowDays}日の対戦記録から、勝率と使用率を組み合わせたTierスコア順に並べています。全体とガチバトル（エリート以上）は混ぜずに別々で集計し、1日2回更新しています。`,
    links: [{ href: "/about", label: "集計方法を見る" }, { href: "/tier", label: "総合Tier表" }],
  })
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
