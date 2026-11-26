"use client"

import { useState } from "react"
import Link from "@/components/document-link"
import Image from "next/image"
import { getModeIconUrl, translateMode } from "@/lib/translations"
import { ArrowLeft, ArrowRight, BarChart3, MapPin, Swords, TrendingUp, TrendingDown, Trophy, Users } from "lucide-react"
import type { BrawlerPageData, Cohort, CohortData, ConditionRow, PairRow } from "@/lib/brawler-page-data"
import { conditionPath, MODE_SLUGS } from "@/lib/condition-pages"
import DocumentLink from "@/components/document-link"
import { brawlerSummary } from "@/lib/page-insights"
import { brawlerFaq } from "@/lib/faq"
import { DataSummary } from "@/components/data-summary"
import { FaqSection } from "@/components/faq-section"

const count = (value: number) => value.toLocaleString("ja-JP")
const percent = (value: number) => `${value.toFixed(1)}%`
const winColor = (value: number) => value >= 55 ? "text-green-500" : value >= 50 ? "text-blue-500" : "text-orange-500"
const tierColors: Record<string, string> = {
  "S+": "from-purple-600 to-fuchsia-500", S: "from-pink-500 to-rose-500",
  "A+": "from-red-500 to-amber-500", A: "from-orange-500 to-yellow-500",
  B: "from-yellow-500 to-lime-500", C: "from-blue-500 to-cyan-500",
  D: "from-slate-500 to-gray-500", "N/A": "from-zinc-500 to-stone-500",
}
const pairStyles = {
  favorable: { row: "hover:bg-green-500/10", image: "border-green-500/30", value: "text-green-500" },
  unfavorable: { row: "hover:bg-red-500/10", image: "border-red-500/30", value: "text-red-500" },
  allies: { row: "hover:bg-purple-500/10", image: "border-purple-500/30", value: "text-purple-400" },
}

function ConditionTable({ rows, kind }: { rows: ConditionRow[]; kind: "モード" | "マップ" }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground py-4">データ不足</p>
  return <div className="overflow-x-auto"><table className="w-full text-sm">
    <thead><tr className="text-muted-foreground border-b border-border/50 text-xs">
      <th scope="col" className="text-left py-3 font-medium">{kind}</th>
      <th scope="col" className="text-right px-3 py-3 font-medium whitespace-nowrap">勝率</th>
      <th scope="col" className="text-right py-3 font-medium whitespace-nowrap">集計件数</th>
    </tr></thead>
    <tbody>{rows.map(row => <tr key={row.id} className="border-b border-border/30 last:border-0 hover:bg-secondary/20 transition-colors">
      <th scope="row" className="text-left py-3 font-bold text-zinc-200">
        <span className="flex items-center gap-2">
          {kind === "モード" && <Image src={getModeIconUrl(row.id)} alt="" width={24} height={24} className="w-6 h-6 object-contain shrink-0 drop-shadow-md" />}
          {(kind === "モード" || row.modeIds?.some(mode => MODE_SLUGS[mode])) && conditionPath(kind === "モード" ? "modes" : "maps", row.id)
            ? <DocumentLink href={conditionPath(kind === "モード" ? "modes" : "maps", row.id)!} className="hover:text-primary hover:underline">{row.label}</DocumentLink> : <span>{row.label}</span>}
        </span>
        {kind === "マップ" && <span className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[10px] sm:text-xs font-normal text-muted-foreground">
          {row.modeIds?.length ? row.modeIds.map(mode => {
            const iconUrl = getModeIconUrl(mode, false)
            return <span key={mode} className="inline-flex items-center gap-1">
              {iconUrl ? <Image src={iconUrl} alt="" width={16} height={16} className="w-4 h-4 object-contain shrink-0" /> : <MapPin aria-hidden="true" className="w-4 h-4 shrink-0" />}
              {translateMode(mode)}
            </span>
          }) : <span>モード不明</span>}
        </span>}
      </th>
      <td className={`text-right px-3 py-3 font-black tabular-nums whitespace-nowrap ${winColor(row.win_rate)}`}>{percent(row.win_rate)}{!row.sample_sufficient && <span className="block text-[10px] font-normal text-muted-foreground">データ不足</span>}</td>
      <td className="text-right py-3 text-xs text-muted-foreground tabular-nums">{count(row.total_matches)}</td>
    </tr>)}</tbody>
  </table></div>
}

function PairList({ rows, tone }: { rows: PairRow[]; tone: keyof typeof pairStyles }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground py-4">データ不足</p>
  const style = pairStyles[tone]
  return <ul className="space-y-1 mt-3">{rows.map(row => <li key={row.slug}>
    <Link prefetch={false} href={`/brawlers/${row.slug}`} className={`group flex items-center justify-between gap-2 rounded-lg p-2 transition-colors ${style.row}`}>
      <span className="flex items-center gap-2 min-w-0">
        {row.imageUrl && <Image src={row.imageUrl} alt="" width={32} height={32} className={`w-8 h-8 rounded-lg border shrink-0 transition-transform group-hover:scale-105 ${style.image}`} />}
        <span className="text-sm font-bold text-zinc-200 group-hover:text-white">{row.nameJa}</span>
      </span>
      <span className="text-right shrink-0"><span className={`text-sm font-black tabular-nums ${style.value}`}>{percent(row.win_rate)}</span>
        <span className="block text-[10px] text-muted-foreground">{count(row.matches)}件</span>
        {row.lift !== undefined && <span className="block text-[10px] text-muted-foreground">相性補正 +{row.lift.toFixed(1)}pt</span>}
      </span>
    </Link>
  </li>)}</ul>
}

function StatsPanel({ data }: { data: CohortData }) {
  const stats = data.stats
  if (!stats) return <p className="text-muted-foreground py-8 text-center">この条件のデータはまだありません。</p>
  return <div className="space-y-6">
    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="rounded-xl bg-purple-500/10 border border-purple-500/20 p-4 text-center shadow-inner">
        <dt className="flex justify-center items-center gap-1.5 text-xs text-muted-foreground mb-2"><Trophy aria-hidden="true" className="w-4 h-4 text-yellow-500" />Tier / 順位</dt>
        <dd className="flex flex-wrap justify-center items-center gap-2 font-black tabular-nums">
          {stats.sample_sufficient ? <><span className={`rounded-lg bg-gradient-to-br px-3 py-1 text-2xl text-white shadow-sm ${tierColors[data.tier] || tierColors["N/A"]}`}>{data.tier}</span><span className="text-sm text-zinc-300">/ {stats.rank_position ?? "—"}位</span></> : <span className="text-sm text-muted-foreground">データ不足</span>}
        </dd>
      </div>
      <div className="rounded-xl bg-secondary/20 p-4 text-center shadow-inner">
        <dt className="flex justify-center items-center gap-1.5 text-xs text-muted-foreground mb-2"><TrendingUp aria-hidden="true" className={`w-4 h-4 ${winColor(stats.win_rate)}`} />勝率</dt>
        <dd className={`text-2xl sm:text-3xl font-black tabular-nums ${winColor(stats.win_rate)}`}>{percent(stats.win_rate)}</dd>
      </div>
      <div className="rounded-xl bg-secondary/20 p-4 text-center shadow-inner">
        <dt className="flex justify-center items-center gap-1.5 text-xs text-muted-foreground mb-2"><Users aria-hidden="true" className="w-4 h-4 text-primary" />使用率</dt>
        <dd className="text-2xl sm:text-3xl font-black tabular-nums text-primary">{stats.use_rate.toFixed(2)}%</dd>
      </div>
      <div className="rounded-xl bg-secondary/20 p-4 text-center shadow-inner">
        <dt className="flex justify-center items-center gap-1.5 text-xs text-muted-foreground mb-2"><Swords aria-hidden="true" className="w-4 h-4 text-cyan-400" />集計件数</dt>
        <dd className="text-2xl sm:text-3xl font-black tabular-nums">{count(stats.total_matches)}</dd>
      </div>
    </dl>
    {stats.confidence_interval && <p className="text-xs text-muted-foreground">勝率の95%信頼区間：{percent(stats.confidence_interval[0])}〜{percent(stats.confidence_interval[1])}</p>}
    <div className="grid lg:grid-cols-2 gap-6">
      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-md p-4 sm:p-6">
        <h2 className="font-bold text-lg text-zinc-100 flex items-center gap-2"><span className="rounded-lg bg-purple-500/10 p-2"><BarChart3 aria-hidden="true" className="w-5 h-5 text-purple-400" /></span>モード別の勝率</h2>
        <ConditionTable rows={data.modes} kind="モード" />
      </section>
      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-md p-4 sm:p-6">
        <h2 className="font-bold text-lg text-zinc-100 flex items-center gap-2"><span className="rounded-lg bg-cyan-500/10 p-2"><MapPin aria-hidden="true" className="w-5 h-5 text-cyan-400" /></span>おすすめマップ</h2>
        <p className="text-xs text-muted-foreground mt-2">十分なデータがあるマップを、勝率の信頼区間の下限順に表示。</p>
        <ConditionTable rows={data.maps} kind="マップ" />
      </section>
    </div>
    <div className="grid lg:grid-cols-3 gap-4">
      <section className="rounded-xl border border-green-500/20 bg-green-500/5 p-4">
        <h2 className="font-extrabold text-sm text-green-400 flex items-center gap-2"><TrendingUp aria-hidden="true" className="w-5 h-5" />有利な敵キャラ</h2><PairList rows={data.favorable} tone="favorable" />
      </section>
      <section className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
        <h2 className="font-extrabold text-sm text-red-400 flex items-center gap-2"><TrendingDown aria-hidden="true" className="w-5 h-5" />不利な敵キャラ</h2><PairList rows={data.unfavorable} tone="unfavorable" />
      </section>
      <section className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
        <h2 className="font-extrabold text-sm text-purple-400 flex items-center gap-2"><Users aria-hidden="true" className="w-5 h-5" />相性のよい味方</h2><PairList rows={data.allies} tone="allies" />
      </section>
    </div>
    <p className="text-xs text-muted-foreground">相性：{data.matchupScope}の補正勝率。敵・味方にそのキャラがいる試合のチーム成績です。</p>
    <p className="text-xs text-muted-foreground">集計：直近{data.windowDays}日・記録されたプレイヤーごとの対戦件数。更新：{data.updatedAt ? <time dateTime={data.updatedAt}>{data.updatedLabel}</time> : data.updatedLabel}（日本時間）</p>
  </div>
}

export default function BrawlerDetailView({ data }: { data: BrawlerPageData }) {
  const [selected, setSelected] = useState<Cohort>("global")
  return <div className="arena-workspace arena-detail max-w-7xl mx-auto space-y-6 sm:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
    <nav aria-label="パンくず" className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <Link href="/" className="hover:text-primary">ホーム</Link><span aria-hidden="true">/</span>
      <Link href="/brawlers" className="hover:text-primary">キャラ一覧</Link><span aria-hidden="true">/</span><span aria-current="page">{data.nameJa}</span>
    </nav>
    <header className="flex items-center gap-4 sm:gap-6">
      {data.imageUrl && <Image src={data.imageUrl} alt={data.nameJa} width={80} height={80} className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl border-4 border-background ring-2 ring-primary/20 bg-primary/10 shadow-xl shrink-0" priority />}
      <div className="min-w-0"><p className="text-xs font-bold text-muted-foreground mb-1">ブロスタ キャラ分析</p><h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-primary via-purple-400 to-cyan-400 bg-clip-text text-transparent">{data.nameJa}の勝率・相性</h1></div>
    </header>
    <DataSummary summary={brawlerSummary(data)} />
    <div role="tablist" aria-label="集計対象" className="grid grid-cols-2 gap-1.5 max-w-[600px] mx-auto rounded-xl bg-card/80 backdrop-blur-sm border border-border/50 shadow-sm p-1.5">
      {(["global", "gachi"] as const).map(type => <button key={type} type="button" role="tab" id={`${type}-tab`} aria-selected={selected === type} aria-controls={`${type}-panel`}
        tabIndex={selected === type ? 0 : -1} onClick={() => setSelected(type)}
        onKeyDown={event => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return
          event.preventDefault()
          const next = event.key === "Home" ? "global" : event.key === "End" ? "gachi" : selected === "global" ? "gachi" : "global"
          setSelected(next)
          document.getElementById(`${next}-tab`)?.focus()
        }}
        className={`flex flex-wrap justify-center items-center gap-x-2 gap-y-0.5 rounded-lg px-2 sm:px-4 py-3 text-sm sm:text-base font-bold transition-all focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 ${selected === type ? "bg-secondary/60 text-foreground shadow-sm border border-border/30" : "border border-transparent text-muted-foreground hover:bg-secondary/30 hover:text-foreground"}`}>
        {type === "global" ? "全体" : <><Trophy aria-hidden="true" className="w-4 h-4 shrink-0" /><span>ガチバトル</span><span className="text-[10px] sm:text-xs">（エリート以上）</span></>}
      </button>)}
    </div>
    {(["global", "gachi"] as const).map(type => <section key={type} role="tabpanel" id={`${type}-panel`} aria-labelledby={`${type}-tab`} hidden={selected !== type}>
      <StatsPanel data={data.cohorts[type]} />
    </section>)}
    {data.relatedBrawlers && data.relatedBrawlers.length > 0 && (
      <section aria-labelledby="related-brawlers-title" className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-6 space-y-3">
        <h2 id="related-brawlers-title" className="font-bold text-lg text-zinc-100">他のキャラの勝率・評価</h2>
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {data.relatedBrawlers.map(row => (
            <li key={row.slug}>
              <Link prefetch={false} href={`/brawlers/${row.slug}`} className="group flex items-center gap-2.5 rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-2.5 hover:border-primary/40 hover:bg-primary/5 transition-colors">
                {row.imageUrl && <Image src={row.imageUrl} alt="" width={36} height={36} loading="lazy" className="w-9 h-9 rounded-lg border border-zinc-700/60 shrink-0" />}
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-zinc-100 group-hover:text-primary truncate">{row.nameJa}</span>
                  <span className="block text-[11px] text-muted-foreground tabular-nums">
                    {row.tier !== "N/A" ? `Tier ${row.tier}` : "データ不足"}{row.winRate !== null ? ` · 勝率${row.winRate.toFixed(1)}%` : ""}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    )}
    <div className="grid sm:grid-cols-2 gap-3 text-sm font-bold">
      <Link href="/tier" className="group flex items-center gap-3 rounded-2xl bg-zinc-900/40 hover:bg-zinc-900/80 border border-zinc-800/80 hover:border-purple-500/40 p-4 transition-all duration-300"><span className="rounded-xl bg-purple-500/10 p-2.5"><Trophy aria-hidden="true" className="w-5 h-5 text-purple-400" /></span><span className="group-hover:text-purple-300 transition-colors">Tier表に戻る</span><ArrowLeft aria-hidden="true" className="w-4 h-4 text-muted-foreground ml-auto" /></Link>
      <Link href="/brawlers" className="group flex items-center gap-3 rounded-2xl bg-zinc-900/40 hover:bg-zinc-900/80 border border-zinc-800/80 hover:border-cyan-500/40 p-4 transition-all duration-300"><span className="rounded-xl bg-cyan-500/10 p-2.5"><Users aria-hidden="true" className="w-5 h-5 text-cyan-400" /></span><span className="group-hover:text-cyan-300 transition-colors">他のキャラを見る</span><ArrowRight aria-hidden="true" className="w-4 h-4 text-muted-foreground ml-auto transition-transform group-hover:translate-x-1" /></Link>
    </div>
    <FaqSection id="faq-brawler" items={brawlerFaq(data)} />
  </div>
}
