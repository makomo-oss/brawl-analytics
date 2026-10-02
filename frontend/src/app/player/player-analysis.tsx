"use client"

import { useEffect, useRef, useState } from "react"
import { BarChart3, Target, TrendingUp, Users, Swords, RefreshCw, Trophy, Info, Crown, Sparkles, ShieldAlert, CheckCircle2, Filter, ChevronRight, MapPin } from "lucide-react"
import { API_URL } from "@/lib/config"
import { getBrawlerInfo } from "@/lib/brawlers"
import { translateMap, translateMode, getModeIconUrl } from "@/lib/translations"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface Stats {
  matches: number; wins: number; losses: number; draws: number; decided: number
  win_rate: number | null; interval_low: number | null; interval_high: number | null
  evidence: "low" | "medium" | "high"
  reference_win_rate: number | null; reference_matches: number; reference_coverage: number; gap: number | null
  comparison_matches: number; comparison_wins: number; comparison_win_rate: number | null
}
interface AnalysisRow extends Stats {
  id: string; label: string; mode?: string; map?: string
  dimension?: "character" | "map_character"; supported?: boolean
  basis?: "personal" | "reference"
}
interface DailyStats extends Stats { date: string }
interface Analysis {
  filters: { days: number; match_type: string; hero: string; mode: string; map: string }
  coverage: { retained_matches: number; earliest: string | null; latest: string | null; truncated: boolean; reference_available: boolean; history_days: number }
  options: { heroes: string[]; modes: string[]; maps: string[] }
  summary: Stats & { active_days: number; best_win_streak: number }
  trend: { days: number; current: Stats; previous: Stats; comparable: boolean; delta: number | null }
  timeline: DailyStats[]; characters: AnalysisRow[]; modes: AnalysisRow[]; maps: AnalysisRow[]
  map_characters: AnalysisRow[]; allies: AnalysisRow[]; opponents: AnalysisRow[]
  practice: AnalysisRow[]; strengths: AnalysisRow[]; pair_matches: number; generated_at: string
}

const rate = (value: number | null) => value === null ? "—" : `${value.toFixed(1)}%`
const points = (value: number | null) => value === null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(1)}pt`
const dayLabel = (value: string) => new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" }).format(new Date(value))
const panelClass = "bg-card/40 backdrop-blur-md border-primary/20 shadow-xl overflow-hidden"

function FilterSelect({ label, value, onChange, options, disabled = false }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; disabled?: boolean }) {
  return <div className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-muted-foreground">
    <span>{label}</span>
    <Select items={options} value={value} disabled={disabled} onValueChange={next => { if (next !== null) onChange(next) }}>
      <SelectTrigger aria-label={label} className="w-full min-w-0 border-primary/20 bg-secondary/30 text-foreground data-[size=default]:h-10"><SelectValue /></SelectTrigger>
      <SelectContent>{options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
    </Select>
  </div>
}

function Evidence({ row }: { row: Stats }) {
  return <Badge variant="outline" className={`whitespace-nowrap text-[10px] ${row.evidence === "low" ? "text-muted-foreground" : row.evidence === "medium" ? "text-amber-400 border-amber-500/30" : "text-emerald-400 border-emerald-500/30"}`}
    title={row.decided ? `勝率の目安幅: ${row.interval_low}〜${row.interval_high}%（95% Wilson区間）。試合の偏りは含みません。` : "勝敗が決まった試合がありません"}>
    {row.evidence === "low" ? "参考・10試合未満" : row.evidence === "medium" ? "蓄積中" : "30試合以上"}
  </Badge>
}

function CharacterLabel({ name }: { name: string }) {
  const info = getBrawlerInfo(name)
  return <span className="flex items-center gap-2">
    <Avatar className="size-10 shrink-0 border border-primary/30 shadow-sm"><AvatarImage src={info.imageUrl} alt="" /><AvatarFallback>{info.nameJa.slice(0, 1)}</AvatarFallback></Avatar>
    <span className="font-semibold">{info.nameJa}</span>
  </span>
}

function WinRateBar({ row }: { row: Stats }) {
  const positive = row.gap === null || row.gap >= 0
  return <div className="space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">自分の勝率 <strong className={`ml-1 text-base ${positive ? "text-green-400" : "text-rose-400"}`}>{rate(row.win_rate)}</strong></span>
      {row.gap !== null && row.reference_coverage === 100 && <Badge className={`${positive ? "bg-green-500/10 text-green-400 border-green-500/30" : "bg-red-500/10 text-red-400 border-red-500/30"} border font-extrabold`}>{points(row.gap)}</Badge>}
    </div>
    <div className="relative h-2.5 overflow-hidden rounded-full bg-secondary shadow-inner" aria-hidden="true">
      {row.reference_win_rate !== null && <div className="absolute inset-y-0 left-0 bg-purple-500/35" style={{ width: `${row.reference_win_rate}%` }} />}
      <div className={`absolute inset-y-0 left-0 rounded-full ${positive ? "bg-gradient-to-r from-green-600 to-emerald-400" : "bg-gradient-to-r from-red-600 to-rose-400"}`} style={{ width: `${row.win_rate ?? 0}%` }} />
      {row.reference_win_rate !== null && <div className="absolute inset-y-0 w-0.5 bg-purple-200" style={{ left: `${Math.min(99.5, row.reference_win_rate)}%` }} />}
    </div>
    {row.reference_win_rate !== null && <p className="text-[11px] text-muted-foreground">紫の目印：同条件の全体勝率 {rate(row.reference_win_rate)}{row.reference_coverage < 100 ? ` · 比較対象の自分 ${rate(row.comparison_win_rate)}（${row.comparison_matches}戦・差 ${points(row.gap)}）` : ""}</p>}
  </div>
}

function StatsCards({ rows, dimension, onSelect }: { rows: AnalysisRow[]; dimension: "character" | "mode" | "map" | "map_character"; onSelect?: (row: AnalysisRow) => void }) {
  const [expanded, setExpanded] = useState(false)
  const [sort, setSort] = useState("matches")
  const sorted = [...rows].sort((a, b) => sort === "win_rate" ? (b.win_rate ?? -1) - (a.win_rate ?? -1) || b.matches - a.matches
    : sort === "gap" ? (a.gap ?? Infinity) - (b.gap ?? Infinity) || b.matches - a.matches : b.matches - a.matches)
  if (!rows.length) return <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">この条件の戦績はまだありません。</p>
  return <div className="space-y-3">
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground">{rows.length}件{onSelect ? "・名前を押すとその条件に絞り込み" : ""}</p>
      <Select items={[{ value: "matches", label: "試合数" }, { value: "win_rate", label: "勝率" }, { value: "gap", label: "全体より低い順" }]} value={sort} onValueChange={next => { if (next !== null) setSort(next) }}>
        <SelectTrigger aria-label={`${dimension === "character" ? "キャラ" : dimension === "mode" ? "モード" : dimension === "map" ? "マップ" : "キャラとマップ"}の並び順`} className="border-primary/20 bg-secondary/30"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="matches">試合数</SelectItem><SelectItem value="win_rate">勝率</SelectItem><SelectItem value="gap">全体より低い順</SelectItem></SelectContent>
      </Select>
    </div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {(expanded ? sorted : sorted.slice(0, 10)).map(row => <Card key={row.id} className="gap-0 border-primary/20 bg-card/80 py-0 shadow-lg">
        <CardContent className="space-y-4 p-4">
          <button type="button" disabled={!onSelect} onClick={() => onSelect?.(row)} className="flex w-full items-center justify-between gap-3 rounded-lg text-left transition-colors enabled:hover:text-purple-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <span className="min-w-0">
              {dimension === "character" || dimension === "map_character" ? <CharacterLabel name={row.label} /> : <span className="flex items-center gap-3"><Avatar className="size-10 shrink-0 bg-primary/10"><AvatarImage src={getModeIconUrl(row.mode || row.label)} alt="" /><AvatarFallback><MapPin className="size-5 text-purple-400" /></AvatarFallback></Avatar><span className="font-bold">{dimension === "mode" ? translateMode(row.label) : translateMap(row.label)}</span></span>}
              {row.mode && <span className="mt-2 block text-xs text-muted-foreground">{row.map ? `${translateMap(row.map)} · ` : ""}{translateMode(row.mode)}</span>}
            </span>
            {onSelect && <ChevronRight className="size-4 shrink-0 text-purple-400" />}
          </button>
          <WinRateBar row={row} />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span><strong className="text-green-400">{row.wins}勝</strong> <strong className="text-rose-400">{row.losses}敗</strong>{row.draws > 0 ? ` ${row.draws}分` : ""}<span className="ml-2 text-muted-foreground">{row.matches}試合</span></span><Evidence row={row} /></div>
          <details className="text-[11px] text-muted-foreground"><summary className="cursor-pointer">データの目安</summary><p className="mt-2">勝率の目安幅 {rate(row.interval_low)}〜{rate(row.interval_high)}{row.reference_win_rate === null ? " · 全体との比較データは不足しています" : ` · 比較元 ${row.reference_matches.toLocaleString()}件`}</p></details>
        </CardContent>
      </Card>)}
    </div>
    {rows.length > 10 && <Button variant="outline" size="sm" onClick={() => setExpanded(!expanded)}>{expanded ? "10件に戻す" : `全${rows.length}件を表示`}</Button>}
  </div>
}

function TrendChart({ timeline }: { timeline: DailyStats[] }) {
  const [selectedDate, setSelectedDate] = useState("")
  const chartViewport = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const viewport = chartViewport.current
    if (viewport) viewport.scrollLeft = viewport.scrollWidth
  }, [timeline])
  const selected = timeline.find(row => row.date === selectedDate) ?? [...timeline].reverse().find(row => row.matches > 0) ?? timeline.at(-1)
  const max = Math.max(1, ...timeline.map(row => row.matches))
  return <div className="space-y-3">
    <p className="text-xs text-muted-foreground">棒の高さは保存済みの試合数。日付を選ぶとその日の成績を確認できます。</p>
    <div ref={chartViewport} className="overflow-x-auto rounded-xl bg-secondary/10 p-3">
      <div className="flex h-32 items-end gap-1" style={{ minWidth: timeline.length * 22 }}>
        {timeline.map(row => <button type="button" key={row.date} aria-label={`${dayLabel(row.date)}: ${row.matches}試合、${row.wins}勝${row.losses}敗${row.draws}分、勝率${rate(row.win_rate)}`}
          aria-pressed={selected?.date === row.date} title={`${dayLabel(row.date)} · ${row.matches}試合 · 勝率${rate(row.win_rate)}`} onClick={() => setSelectedDate(row.date)}
          className={`flex h-full min-w-4 flex-1 items-end rounded-sm px-0.5 pb-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${selected?.date === row.date ? "bg-primary/15 ring-1 ring-primary/60" : "hover:bg-secondary/40"}`}>
          <span className="flex w-full flex-col overflow-hidden rounded-sm bg-secondary" style={{ height: row.matches ? `${Math.max(5, row.matches / max * 100)}%` : 2 }}>
            {row.matches > 0 && <><span className="bg-emerald-500/80" style={{ height: `${row.wins / row.matches * 100}%` }} /><span className="bg-rose-500/70" style={{ height: `${row.losses / row.matches * 100}%` }} /><span className="bg-slate-500" style={{ height: `${row.draws / row.matches * 100}%` }} /></>}
          </span>
        </button>)}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-muted-foreground"><span>{timeline[0] && dayLabel(timeline[0].date)}</span><span>緑：勝利　赤：敗北　灰：引き分け</span><span>{timeline.at(-1) && dayLabel(timeline.at(-1)!.date)}</span></div>
    </div>
    {selected && <p className="text-sm tabular-nums" aria-live="polite"><span className="font-semibold">{dayLabel(selected.date)}</span><span className="ml-3 text-muted-foreground">{selected.matches ? `${selected.matches}試合 · ${selected.wins}勝 ${selected.losses}敗 ${selected.draws}分 · 勝率 ${rate(selected.win_rate)}` : "保存済みの試合がありません"}</span></p>}
  </div>
}

function Advice({ rows, kind, onSelect }: { rows: AnalysisRow[]; kind: "practice" | "strength"; onSelect: (row: AnalysisRow) => void }) {
  return <Card className={`relative overflow-hidden bg-gradient-to-br from-card via-card shadow-lg ${kind === "practice" ? "to-red-950/20 border-red-500/40" : "to-purple-950/20 border-purple-500/40"}`}>
    <div className={`pointer-events-none absolute -right-8 -top-8 size-32 rounded-full blur-2xl ${kind === "practice" ? "bg-red-500/10" : "bg-purple-500/10"}`} />
    <CardHeader><CardTitle className={`flex items-center gap-2 font-extrabold ${kind === "practice" ? "text-red-400" : "text-purple-400"}`}>{kind === "practice" ? <Target className="size-5 text-red-400" /> : <Sparkles className="size-5 text-yellow-400" />}{kind === "practice" ? "要練習（アドバイス）" : "あなたの得意キャラ"}</CardTitle>
      <CardDescription>{kind === "practice" ? "次に振り返りたいキャラとマップ" : "試合数と勝率から見つけた、頼れる候補"}</CardDescription></CardHeader>
    <CardContent className="space-y-3">
      {rows.length ? rows.map(row => <button type="button" key={`${row.dimension}-${row.id}`} onClick={() => onSelect(row)} className={`w-full rounded-xl border bg-card/60 p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${kind === "practice" ? "border-red-500/20 hover:border-red-400/60" : "border-purple-500/25 hover:border-purple-400/60"}`}>
        <div className="flex items-center justify-between gap-2"><CharacterLabel name={row.label} /><ChevronRight className="size-4 shrink-0 text-muted-foreground" /></div>
        {row.map && <p className="mt-2 text-xs text-muted-foreground">{translateMap(row.map)} · {translateMode(row.mode || "")}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2"><Badge className={`border font-bold ${kind === "practice" ? "bg-red-500/10 text-red-400 border-red-500/30" : "bg-purple-500/15 text-purple-300 border-purple-500/30"}`}>{row.basis === "personal" ? `勝率 ${rate(row.win_rate)}` : `全体との差 ${points(row.gap)}`}</Badge><span className="text-xs text-muted-foreground">{row.wins}勝 {row.losses}敗 · {row.matches}試合</span></div>
        <p className="mt-2 text-[11px] text-muted-foreground">{row.basis === "personal" ? "個人成績からの候補 · 全体との比較データは不足" : `同条件の${row.comparison_matches}戦で比較${row.supported ? "" : " · まだ振れのある候補"}`}</p>
      </button>) : <div className="rounded-xl bg-secondary/20 p-4 text-sm leading-relaxed text-muted-foreground">{kind === "practice" ? "今のデータでは要練習の候補はありません。マップ別の成績から気になる試合を振り返ってみましょう。" : "得意キャラを見つけるには、もう少し戦績が必要です。同期して記録を増やしましょう。"}</div>}
    </CardContent>
  </Card>
}

function Spotlight({ data, onCharacter, onPairs }: { data: Analysis; onCharacter: (row: AnalysisRow) => void; onPairs: () => void }) {
  const picks = [...data.characters].sort((a, b) => b.wins - a.wins || b.matches - a.matches).slice(0, 3)
  return <Card className="overflow-hidden border-2 border-purple-500/30 bg-gradient-to-r from-purple-950/40 via-background to-blue-950/40 shadow-xl backdrop-blur-md">
    <CardHeader className="pb-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-xl font-black text-purple-400"><Crown className="size-6 text-yellow-400" />戦績・相性アナライザー</CardTitle><CardDescription className="mt-1 text-xs">あなたの活躍と、対戦したキャラの傾向をひと目で</CardDescription></div><Badge className="border border-purple-500/40 bg-purple-500/10 px-3 py-1 text-purple-300">{data.summary.matches}試合データ</Badge></div></CardHeader>
    <CardContent><div className="grid gap-6 md:grid-cols-2">
      {[{ rows: picks, enemy: false }, { rows: data.opponents.slice(0, 3), enemy: true }].map(group => <div key={String(group.enemy)} className={`space-y-3 rounded-2xl border bg-secondary/20 p-4 ${group.enemy ? "border-red-500/20" : "border-green-500/20"}`}>
        <div className="flex flex-wrap items-center justify-between gap-2"><span className={`flex items-center gap-1.5 text-sm font-bold ${group.enemy ? "text-red-400" : "text-green-400"}`}>{group.enemy ? <ShieldAlert className="size-4" /> : <CheckCircle2 className="size-4" />}{group.enemy ? "敵にいるときの対戦成績" : "あなたの勝利貢献キャラ"}</span><span className="text-[10px] text-muted-foreground">{group.enemy ? "5対戦以上のキャラ" : "勝利数 TOP3"}</span></div>
        {group.rows.length ? group.rows.map((row, index) => <button type="button" key={row.id} onClick={() => group.enemy ? onPairs() : onCharacter(row)} className={`flex w-full items-center justify-between gap-3 rounded-xl border bg-card/60 p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${group.enemy ? "border-red-500/10 hover:border-red-500/40" : "border-green-500/10 hover:border-green-500/40"}`}>
          <span className="flex min-w-0 items-center gap-2"><span className={`text-sm font-extrabold ${group.enemy ? "text-red-400" : "text-green-400"}`}>#{index + 1}</span><span><CharacterLabel name={row.label} /><span className="mt-1 block text-[10px] text-muted-foreground">{row.wins}勝 {row.losses}敗 · {row.matches}{group.enemy ? "対戦" : "試合"}</span></span></span>
          <Badge className={`shrink-0 border text-xs font-black ${group.enemy ? "border-red-500/30 bg-red-500/20 text-red-400" : "border-green-500/30 bg-green-500/20 text-green-400"}`}>{group.enemy ? `敗北率 ${rate(row.decided ? row.losses / row.decided * 100 : null)}` : `勝率 ${rate(row.win_rate)}`}</Badge>
        </button>) : <p className="py-4 text-center text-xs text-muted-foreground">{group.enemy ? "5対戦以上の3対3データがまだありません。" : "この条件の戦績はまだありません。"}</p>}
        <button type="button" onClick={group.enemy ? onPairs : () => { if (picks[0]) onCharacter(picks[0]) }} disabled={!group.rows.length} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-purple-400 disabled:opacity-50">{group.enemy ? "味方・敵との相性を詳しく見る" : "キャラを押して成績を見る"}<ChevronRight className="size-3" /></button>
      </div>)}
    </div></CardContent>
  </Card>
}

function MetaGap({ rows, onSelect }: { rows: AnalysisRow[]; onSelect: (row: AnalysisRow) => void }) {
  const comparable = rows.filter(row => row.gap !== null).slice(0, 5)
  return <Card className="border-primary/20 bg-card/80 shadow-lg backdrop-blur-sm"><CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="size-5 text-primary" />メタ・ギャップ分析</CardTitle><CardDescription>同じキャラ・マップ・モードで、全体との差を確認</CardDescription></CardHeader><CardContent className="space-y-4">
    {comparable.length ? comparable.map(row => <div key={row.id} className="space-y-3 rounded-xl border border-border/40 bg-secondary/20 p-3"><button type="button" onClick={() => onSelect(row)} className="flex w-full items-center justify-between gap-3 rounded-lg text-left focus-visible:ring-2 focus-visible:ring-primary"><CharacterLabel name={row.label} /><ChevronRight className="size-4 text-purple-400" /></button><WinRateBar row={row} /><p className="text-[11px] text-muted-foreground">{row.matches}試合 <span className="ml-2"><Evidence row={row} /></span></p></div>) : <div className="space-y-3 rounded-xl bg-secondary/20 p-4"><div className="flex -space-x-2" aria-hidden="true">{rows.slice(0, 3).map(row => <Avatar key={row.id} className="size-10 border-2 border-card"><AvatarImage src={getBrawlerInfo(row.label).imageUrl} /><AvatarFallback>{getBrawlerInfo(row.label).nameJa.slice(0, 1)}</AvatarFallback></Avatar>)}</div><p className="text-sm text-muted-foreground">同条件の全体データがまだ十分ではありません。キャラ別では、自分の勝率と試合数を確認できます。</p></div>}
  </CardContent></Card>
}

function PairList({ rows, side }: { rows: AnalysisRow[]; side: "allies" | "opponents" }) {
  return <Card className={`${panelClass} ${side === "allies" ? "border-green-500/25 bg-gradient-to-br from-card to-green-950/20" : "border-red-500/25 bg-gradient-to-br from-card to-red-950/20"}`}><CardHeader><CardTitle className={`flex items-center gap-2 text-base ${side === "allies" ? "text-green-400" : "text-red-400"}`}>{side === "allies" ? <Users className="size-5" /> : <Swords className="size-5" />}{side === "allies" ? "味方にいるときの成績" : "敵にいるときの成績"}</CardTitle>
    <CardDescription>{side === "allies" ? "勝ちやすい傾向のある味方から表示" : "勝ちにくい傾向のある敵から表示"} · 試合数による振れも考慮</CardDescription></CardHeader>
    <CardContent className="space-y-3">{rows.length ? rows.map(row => <div key={row.id} className="rounded-xl border border-border/50 bg-secondary/15 p-3">
      <div className="flex items-center justify-between gap-3"><CharacterLabel name={row.label} /><span className="font-bold tabular-nums">{rate(row.win_rate)}</span></div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>{row.wins}勝 {row.losses}敗 · {row.matches}対戦</span><Evidence row={row} /></div>
      <p className="mt-1 text-[11px] text-muted-foreground">目安幅 {row.interval_low}〜{row.interval_high}%{row.reference_win_rate !== null ? ` · 全体参考 ${rate(row.reference_win_rate)}` : ""}</p>
    </div>) : <p className="text-sm leading-relaxed text-muted-foreground">5対戦以上のデータがありません。期間を広げるか、戦績を同期して蓄積してください。</p>}</CardContent>
  </Card>
}

export default function PlayerAnalysis({ playerTag, revision }: { playerTag: string; revision: number }) {
  const [days, setDays] = useState("30")
  const [type, setType] = useState("all")
  const [hero, setHero] = useState("all")
  const [mode, setMode] = useState("all")
  const [map, setMap] = useState("all")
  const [retry, setRetry] = useState(0)
  const [view, setView] = useState("overview")
  const [trendOpen, setTrendOpen] = useState(false)
  const [result, setResult] = useState<{ key: string; data?: Analysis; error?: string }>({ key: "" })
  const query = new URLSearchParams({ days, match_type: type, hero, mode, map_id: map }).toString()
  const requestKey = `${playerTag}:${revision}:${query}:${retry}`
  const loading = result.key !== requestKey
  const data = result.data

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    async function load() {
      try {
        const response = await fetch(`${API_URL}/player/${encodeURIComponent(playerTag.replace(/^#+/, ""))}/analysis?${query}`, { signal: controller.signal })
        if (!response.ok) throw new Error("保存済みの戦績分析を取得できませんでした。")
        const analysis: Analysis = await response.json()
        if (active) setResult({ key: requestKey, data: analysis })
      } catch (error) {
        if (active && !controller.signal.aborted) setResult({ key: requestKey, error: error instanceof Error ? error.message : "分析の取得に失敗しました。" })
      }
    }
    load()
    return () => { active = false; controller.abort() }
  }, [playerTag, query, requestKey])

  function resetContext() { setHero("all"); setMode("all"); setMap("all") }
  function focusRow(row: AnalysisRow, dimension: string) {
    setView(dimension === "character" ? "characters" : "contexts")
    if (dimension === "character" || dimension === "map_character") setHero(row.label)
    if (dimension === "mode") { setMode(row.label); setMap("all") }
    if (dimension === "map") { setMode(row.mode || "all"); setMap(row.label) }
    if (dimension === "map_character") { setMode(row.mode || "all"); setMap(row.map || "all") }
  }

  return <section aria-label="戦績分析" aria-busy={loading} className="space-y-6">
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="flex items-center gap-2 text-xl font-extrabold"><BarChart3 className="size-5 text-purple-400" />あなたの戦績分析</h2>
        <div className="grid w-full grid-cols-2 gap-3 sm:w-auto sm:min-w-80">
          <FilterSelect label="分析期間" value={days} onChange={setDays} options={[7, 30, 60].map(value => ({ value: String(value), label: `直近${value}日` }))} />
          <FilterSelect label="試合種別" value={type} onChange={value => { setType(value); resetContext() }} options={[{ value: "all", label: "通常＋ガチバトル" }, { value: "normal", label: "通常マッチ" }, { value: "gachi", label: "ガチバトル" }]} />
        </div>
      </div>
      <details className="rounded-xl border border-primary/15 bg-secondary/10 px-4">
        <summary className="flex cursor-pointer items-center justify-between gap-3 py-3 text-xs font-semibold text-muted-foreground"><span className="flex items-center gap-2"><Filter className="size-3.5 text-purple-400" />キャラ・モード・マップで絞り込む</span><ChevronRight className="size-3.5" /></summary>
        <div className="grid gap-3 pb-4 sm:grid-cols-3">
          <FilterSelect label="分析キャラ" value={hero} disabled={loading} onChange={setHero} options={[{ value: "all", label: "全キャラ" }, ...(data?.options.heroes || []).map(value => ({ value, label: getBrawlerInfo(value).nameJa }))]} />
          <FilterSelect label="分析モード" value={mode} disabled={loading} onChange={value => { setMode(value); setMap("all") }} options={[{ value: "all", label: "全モード" }, ...(data?.options.modes || []).map(value => ({ value, label: translateMode(value) }))]} />
          <FilterSelect label="分析マップ" value={map} disabled={loading} onChange={setMap} options={[{ value: "all", label: "全マップ" }, ...(data?.options.maps || []).map(value => ({ value, label: translateMap(value) }))]} />
        </div>
      </details>
      {(hero !== "all" || mode !== "all" || map !== "all") && <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-muted-foreground">絞り込み中</span>{[hero !== "all" ? getBrawlerInfo(hero).nameJa : "", mode !== "all" ? translateMode(mode) : "", map !== "all" ? translateMap(map) : ""].filter(Boolean).map(label => <Badge key={label} className="border border-purple-500/30 bg-purple-500/15 text-purple-300">{label}</Badge>)}<Button variant="ghost" size="sm" onClick={resetContext} className="text-xs">絞り込みを解除</Button></div>}
    </div>
    {loading ? <div role="status" className="rounded-xl border border-border/50 p-12 text-center text-sm text-muted-foreground"><RefreshCw className="mx-auto mb-3 size-5 animate-spin" />保存済みの戦績を分析中…</div>
      : result.error ? <div role="alert" className="space-y-3 rounded-xl border border-destructive/30 p-6 text-center"><p className="text-sm">{result.error}</p><Button variant="outline" onClick={() => setRetry(value => value + 1)}>分析を再取得</Button></div>
      : data && <>
        {data.coverage.truncated && <p role="status" className="rounded-lg border border-amber-500/30 p-3 text-sm text-amber-400">保存済み戦績が多いため、最新10,000試合に限定して分析しています。</p>}
        {!data.coverage.reference_available && <p role="status" className="text-sm text-amber-400">全体の比較データを取得できていません。個人成績のみ表示しています。</p>}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[{ label: "勝率", value: rate(data.summary.win_rate), detail: `${data.summary.wins}勝 ${data.summary.losses}敗 ${data.summary.draws}分`, Icon: CheckCircle2, color: "text-green-400 border-green-500/20 bg-green-500/5" },
            { label: "分析試合数", value: data.summary.matches.toLocaleString(), detail: `${data.summary.active_days}日分のプレイ記録`, Icon: Swords, color: "text-purple-400 border-purple-500/20 bg-purple-500/5" },
            { label: "最長連勝", value: `${data.summary.best_win_streak}連勝`, detail: "保存された履歴の中で集計", Icon: Trophy, color: "text-yellow-400 border-yellow-500/20 bg-yellow-500/5" },
            { label: `前${data.trend.days}日との勝率差`, value: points(data.trend.delta), detail: data.trend.comparable ? `直近 ${rate(data.trend.current.win_rate)} / 前期 ${rate(data.trend.previous.win_rate)}` : "比較できる戦績を蓄積中", Icon: TrendingUp, color: "text-blue-400 border-blue-500/20 bg-blue-500/5" }].map(item => <div key={item.label} className={`rounded-xl border p-3 ${item.color}`} title={item.label === "最長連勝" ? "未取得の試合は含まれません" : undefined}><div className="flex items-center gap-2 text-[11px] font-bold"><item.Icon className="size-4 shrink-0" />{item.label}</div><p className="mt-1.5 text-2xl font-black tabular-nums">{item.value}</p><p className="mt-1 text-[10px] text-muted-foreground">{item.detail}</p></div>)}
        </div>
        <Tabs value={view} onValueChange={setView} className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 gap-1 bg-secondary/40 p-1 group-data-horizontal/tabs:h-auto sm:grid-cols-4">
            <TabsTrigger value="overview" className="h-10 gap-1.5 font-bold"><Sparkles className="size-4 text-yellow-400" />おすすめ・改善点</TabsTrigger><TabsTrigger value="characters" className="h-10 gap-1.5 font-bold"><Trophy className="size-4 text-purple-400" />キャラ別</TabsTrigger><TabsTrigger value="contexts" className="h-10 gap-1.5 font-bold"><MapPin className="size-4 text-blue-400" />モード・マップ</TabsTrigger><TabsTrigger value="pairs" className="h-10 gap-1.5 font-bold"><Users className="size-4 text-green-400" />味方・敵との相性</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="space-y-5">
            <Spotlight data={data} onCharacter={row => focusRow(row, "character")} onPairs={() => setView("pairs")} />
            <div className="grid items-start gap-6 md:grid-cols-2"><MetaGap rows={data.characters} onSelect={row => focusRow(row, "character")} /><div className="space-y-6"><Advice rows={data.strengths} kind="strength" onSelect={row => focusRow(row, "character")} /><Advice rows={data.practice} kind="practice" onSelect={row => focusRow(row, row.dimension || "character")} /></div></div>
            <details open={trendOpen} onToggle={event => setTrendOpen(event.currentTarget.open)} className="rounded-xl border border-primary/20 bg-card/40 p-4"><summary className="flex cursor-pointer items-center gap-2 font-bold"><TrendingUp className="size-5 text-primary" />成績の推移を見る</summary>{trendOpen && <div className="mt-4 space-y-3"><p className="text-xs text-muted-foreground">直近{data.trend.days}日：{data.trend.current.wins}勝 {data.trend.current.losses}敗 ／ 前{data.trend.days}日：{data.trend.previous.wins}勝 {data.trend.previous.losses}敗</p><TrendChart timeline={data.timeline} /><p className="text-xs leading-relaxed text-muted-foreground">対戦条件が変わると勝率も変わります。キャラ・モード・マップを絞ると同じ条件で推移を確認できます。</p></div>}</details>
          </TabsContent>
          <TabsContent value="characters" className="space-y-3"><h3 className="font-bold">キャラクター別の成績</h3><p className="text-xs leading-relaxed text-muted-foreground">キャラを押すとその戦績に絞り込めます。紫の目印は、同じ条件の全体勝率です。</p><StatsCards rows={data.characters} dimension="character" onSelect={row => focusRow(row, "character")} /></TabsContent>
          <TabsContent value="contexts" className="space-y-6"><div className="space-y-3"><h3 className="flex items-center gap-2 font-bold"><Swords className="size-4 text-purple-400" />モード別</h3><StatsCards rows={data.modes} dimension="mode" onSelect={row => focusRow(row, "mode")} /></div><div className="space-y-3"><h3 className="flex items-center gap-2 font-bold"><MapPin className="size-4 text-blue-400" />マップ別</h3><StatsCards rows={data.maps} dimension="map" onSelect={row => focusRow(row, "map")} /></div><div className="space-y-3"><h3 className="font-bold">キャラ × マップ</h3><StatsCards rows={data.map_characters} dimension="map_character" onSelect={row => focusRow(row, "map_character")} /></div></TabsContent>
          <TabsContent value="pairs" className="space-y-4"><p className="text-sm leading-relaxed text-muted-foreground">勝敗が決まった3対3の{data.pair_matches}試合から集計。5対戦以上のキャラを表示します。味方・敵の編成全体やプレイヤーの影響を含む傾向です。自分のキャラ・モード・マップを絞って確認できます。</p><div className="grid gap-4 lg:grid-cols-2"><PairList rows={data.allies} side="allies" /><PairList rows={data.opponents} side="opponents" /></div></TabsContent>
        </Tabs>
        <div className="space-y-2 text-xs leading-relaxed text-muted-foreground">
          <p className="flex items-start gap-2"><Info className="mt-0.5 size-3.5 shrink-0" /><span>最大{data.coverage.history_days}日以内に保存した{data.coverage.retained_matches.toLocaleString()}試合が対象{data.coverage.earliest ? `（${dayLabel(data.coverage.earliest)}〜${dayLabel(data.coverage.latest!)}）` : ""}。同期で取得した履歴を蓄積しています。未取得の試合は含まれません。</span></p>
          <details><summary className="cursor-pointer py-2 font-medium">集計について</summary><p className="mt-1">フレンド戦を除き、引き分けは勝率の分母から除外します。勝率の目安幅が広いほど、少数試合による振れが大きくなります。連勝は保存された履歴上の値です。</p><p className="mt-2">全体参考は最大60日の試合を新しさで重み付けした値です。個人成績と期間・プレイヤー層は異なります。対応する比較データが個人戦績の80%未満の場合は「—」を表示します。平均との差は、対応データがある自分の試合だけで計算します。練習・得意候補は比較対象となる10試合以上から抽出し、少数試合の差を弱めて評価しています。全体比較が不足するときは、目安幅が50%を上回る得意候補、3対3で50%を下回るキャラとマップの練習候補を、個人成績から表示します。</p></details>
        </div>
      </>}
  </section>
}
