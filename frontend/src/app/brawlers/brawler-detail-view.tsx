"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { ArrowLeft, ArrowRight, BarChart3, MapPin, Swords, Users } from "lucide-react"
import type { BrawlerPageData, Cohort, CohortData, ConditionRow, PairRow } from "@/lib/server-brawler-pages"

const count = (value: number) => value.toLocaleString("ja-JP")
const percent = (value: number) => `${value.toFixed(1)}%`

function ConditionTable({ rows, kind }: { rows: ConditionRow[]; kind: "モード" | "マップ" }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground py-4">データ不足</p>
  return <div className="overflow-x-auto"><table className="w-full text-sm">
    <thead><tr className="text-muted-foreground border-b border-border/50">
      <th scope="col" className="text-left py-3 font-medium">{kind}</th>
      <th scope="col" className="text-right px-3 py-3 font-medium whitespace-nowrap">勝率</th>
      <th scope="col" className="text-right py-3 font-medium whitespace-nowrap">集計件数</th>
    </tr></thead>
    <tbody>{rows.map(row => <tr key={row.id} className="border-b border-border/30 last:border-0">
      <th scope="row" className="text-left py-3 font-medium">{row.label}</th>
      <td className="text-right px-3 py-3 tabular-nums whitespace-nowrap">{percent(row.win_rate)}{!row.sample_sufficient && <span className="block text-[10px] text-muted-foreground">データ不足</span>}</td>
      <td className="text-right py-3 tabular-nums">{count(row.total_matches)}</td>
    </tr>)}</tbody>
  </table></div>
}

function PairList({ rows }: { rows: PairRow[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground py-4">データ不足</p>
  return <ul className="divide-y divide-border/40">{rows.map(row => <li key={row.slug} className="flex items-center justify-between gap-3 py-3">
    <Link prefetch={false} href={`/brawlers/${row.slug}`} className="text-sm font-medium hover:text-primary transition-colors">{row.nameJa}</Link>
    <div className="text-right shrink-0"><span className="text-sm font-bold tabular-nums">{percent(row.win_rate)}</span>
      <span className="block text-[10px] text-muted-foreground">{count(row.matches)}件{row.lift !== undefined ? ` · 相性補正 +${row.lift.toFixed(1)}pt` : ""}</span>
    </div>
  </li>)}</ul>
}

function StatsPanel({ data }: { data: CohortData }) {
  const stats = data.stats
  if (!stats) return <p className="text-muted-foreground py-8 text-center">この条件のデータはまだありません。</p>
  return <div className="space-y-6">
    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
        ["Tier / 順位", stats.sample_sufficient ? `${data.tier} / ${stats.rank_position ?? "—"}位` : "データ不足"],
        ["勝率", percent(stats.win_rate)], ["使用率", `${stats.use_rate.toFixed(2)}%`], ["集計件数", count(stats.total_matches)],
      ].map(([label, value]) => <div key={label} className="rounded-xl bg-card border border-border/60 p-4 text-center">
        <dt className="text-xs text-muted-foreground mb-2">{label}</dt><dd className="text-xl sm:text-2xl font-black tabular-nums">{value}</dd>
      </div>)}
    </dl>
    {stats.confidence_interval && <p className="text-xs text-muted-foreground">勝率の95%信頼区間：{percent(stats.confidence_interval[0])}〜{percent(stats.confidence_interval[1])}</p>}
    <div className="grid lg:grid-cols-2 gap-6">
      <section className="rounded-2xl border border-border/60 bg-card p-4 sm:p-6">
        <h2 className="font-bold text-lg flex items-center gap-2"><BarChart3 className="w-5 h-5 text-primary" />モード別の勝率</h2>
        <ConditionTable rows={data.modes} kind="モード" />
      </section>
      <section className="rounded-2xl border border-border/60 bg-card p-4 sm:p-6">
        <h2 className="font-bold text-lg flex items-center gap-2"><MapPin className="w-5 h-5 text-primary" />おすすめマップ</h2>
        <p className="text-xs text-muted-foreground mt-2">十分なデータがあるマップを、勝率の信頼区間の下限順に表示。</p>
        <ConditionTable rows={data.maps} kind="マップ" />
      </section>
    </div>
    <div className="grid md:grid-cols-3 gap-6">
      <section className="rounded-2xl border border-border/60 bg-card p-4 sm:p-6">
        <h2 className="font-bold flex items-center gap-2"><Swords className="w-4 h-4 text-emerald-400" />有利な敵キャラ</h2><PairList rows={data.favorable} />
      </section>
      <section className="rounded-2xl border border-border/60 bg-card p-4 sm:p-6">
        <h2 className="font-bold flex items-center gap-2"><Swords className="w-4 h-4 text-rose-400" />不利な敵キャラ</h2><PairList rows={data.unfavorable} />
      </section>
      <section className="rounded-2xl border border-border/60 bg-card p-4 sm:p-6">
        <h2 className="font-bold flex items-center gap-2"><Users className="w-4 h-4 text-primary" />相性のよい味方</h2><PairList rows={data.allies} />
      </section>
    </div>
    <p className="text-xs text-muted-foreground">相性：{data.matchupScope}の補正勝率。敵・味方にそのキャラがいる試合のチーム成績です。</p>
    <p className="text-xs text-muted-foreground">集計：直近{data.windowDays}日・記録されたプレイヤーごとの対戦件数。更新：{data.updatedAt ? new Date(data.updatedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "—"}</p>
  </div>
}

export default function BrawlerDetailView({ data }: { data: BrawlerPageData }) {
  const [selected, setSelected] = useState<Cohort>("global")
  return <div className="max-w-6xl mx-auto space-y-6">
    <nav aria-label="パンくず" className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <Link href="/" className="hover:text-primary">ホーム</Link><span aria-hidden="true">/</span>
      <Link href="/brawlers" className="hover:text-primary">キャラ一覧</Link><span aria-hidden="true">/</span><span aria-current="page">{data.nameJa}</span>
    </nav>
    <header className="flex items-center gap-4 rounded-2xl border border-primary/20 bg-card p-5 sm:p-6">
      {data.imageUrl && <Image src={data.imageUrl} alt={data.nameJa} width={80} height={80} className="rounded-xl shrink-0" priority />}
      <div><p className="text-xs text-muted-foreground mb-1">ブロスタ キャラ分析</p><h1 className="text-2xl sm:text-3xl font-black">{data.nameJa}の勝率・相性</h1></div>
    </header>
    <div role="tablist" aria-label="集計対象" className="inline-flex gap-1 rounded-xl bg-secondary/50 p-1">
      {(["global", "gachi"] as const).map(type => <button key={type} type="button" role="tab" id={`${type}-tab`} aria-selected={selected === type} aria-controls={`${type}-panel`}
        tabIndex={selected === type ? 0 : -1} onClick={() => setSelected(type)}
        onKeyDown={event => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return
          event.preventDefault()
          const next = event.key === "Home" ? "global" : event.key === "End" ? "gachi" : selected === "global" ? "gachi" : "global"
          setSelected(next)
          document.getElementById(`${next}-tab`)?.focus()
        }}
        className={`rounded-lg px-4 py-2 text-sm font-bold transition-colors ${selected === type ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
        {type === "global" ? "全体" : "ガチバトル（エリート以上）"}
      </button>)}
    </div>
    {(["global", "gachi"] as const).map(type => <section key={type} role="tabpanel" id={`${type}-panel`} aria-labelledby={`${type}-tab`} hidden={selected !== type}>
      <StatsPanel data={data.cohorts[type]} />
    </section>)}
    <div className="flex flex-wrap gap-6 text-sm font-medium text-primary">
      <Link href="/tier" className="flex items-center gap-2"><ArrowLeft className="w-4 h-4" />Tier表に戻る</Link>
      <Link href="/brawlers" className="flex items-center gap-2">他のキャラを見る<ArrowRight className="w-4 h-4" /></Link>
    </div>
  </div>
}
