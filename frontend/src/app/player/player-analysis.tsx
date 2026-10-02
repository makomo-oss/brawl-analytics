"use client"

import { useEffect, useRef, useState } from "react"
import { BarChart3, Target, TrendingUp, Users, Swords, RefreshCw, Trophy, Info } from "lucide-react"
import { API_URL } from "@/lib/config"
import { getBrawlerInfo } from "@/lib/brawlers"
import { translateMap, translateMode } from "@/lib/translations"
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
    <Avatar size="sm" className="border border-primary/20 shadow-sm"><AvatarImage src={info.imageUrl} alt="" /><AvatarFallback>{info.nameJa.slice(0, 1)}</AvatarFallback></Avatar>
    <span className="font-semibold">{info.nameJa}</span>
  </span>
}

function StatsTable({ rows, dimension, onSelect }: { rows: AnalysisRow[]; dimension: "character" | "mode" | "map" | "map_character"; onSelect?: (row: AnalysisRow) => void }) {
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
    <div className={`overflow-x-auto rounded-xl border ${panelClass}`}>
      <table className="w-full min-w-[650px] text-left text-sm">
        <caption className="sr-only">{dimension === "character" ? "キャラ" : dimension === "mode" ? "モード" : dimension === "map" ? "マップ" : "キャラ × マップ"}別の成績と同条件の全体勝率</caption>
        <thead className="bg-secondary/30 text-xs text-muted-foreground"><tr>
          <th scope="col" className="px-4 py-3">{dimension === "character" ? "キャラクター" : dimension === "mode" ? "モード" : dimension === "map" ? "マップ" : "キャラ × マップ"}</th>
          <th scope="col" className="px-3 py-3">戦績</th><th scope="col" className="px-3 py-3">勝率</th><th scope="col" className="px-3 py-3">全体参考</th><th scope="col" className="px-3 py-3">差</th><th scope="col" className="px-3 py-3">試合数の目安</th>
        </tr></thead>
        <tbody className="divide-y divide-border/50">
          {(expanded ? sorted : sorted.slice(0, 10)).map(row => <tr key={row.id} className="hover:bg-secondary/15">
            <th scope="row" className="px-4 py-3 font-normal">
              <button type="button" disabled={!onSelect} onClick={() => onSelect?.(row)} className="text-left enabled:hover:text-primary enabled:underline-offset-4 enabled:hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded">
                {dimension === "character" || dimension === "map_character" ? <CharacterLabel name={row.label} /> : <span className="font-semibold">{dimension === "mode" ? translateMode(row.label) : translateMap(row.label)}</span>}
                {row.mode && <span className="mt-1 block text-[11px] text-muted-foreground">{row.map ? `${translateMap(row.map)} · ` : ""}{translateMode(row.mode)}</span>}
              </button>
            </th>
            <td className="whitespace-nowrap px-3 py-3 text-xs"><span className="text-emerald-400">{row.wins}勝</span> <span className="text-rose-400">{row.losses}敗</span>{row.draws > 0 && <span className="text-muted-foreground"> {row.draws}分</span>}<span className="mt-1 block text-muted-foreground">{row.matches}試合</span></td>
            <td className="px-3 py-3 font-bold tabular-nums" title={`目安幅 ${row.interval_low ?? "—"}〜${row.interval_high ?? "—"}%`}>{rate(row.win_rate)}{row.reference_win_rate !== null && row.reference_coverage < 100 && <span className="mt-1 block whitespace-nowrap text-[10px] font-normal text-muted-foreground">比較対象: {rate(row.comparison_win_rate)} / {row.comparison_matches}戦</span>}</td>
            <td className="px-3 py-3 tabular-nums text-muted-foreground" title={row.reference_win_rate === null ? "同じ条件の全体データが不足しています" : `比較元 ${row.reference_matches.toLocaleString()}件 · 個人戦績の${row.reference_coverage}%に対応`}>{rate(row.reference_win_rate)}</td>
            <td className={`px-3 py-3 whitespace-nowrap font-medium tabular-nums ${row.gap === null ? "text-muted-foreground" : row.gap >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{points(row.gap)}</td>
            <td className="px-3 py-3"><Evidence row={row} /></td>
          </tr>)}
        </tbody>
      </table>
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
  return <Card className={`${panelClass} ${kind === "practice" ? "border-amber-500/20" : "border-emerald-500/20"}`}>
    <CardHeader><CardTitle className="flex items-center gap-2 text-base">{kind === "practice" ? <Target className="size-4 text-amber-400" /> : <Trophy className="size-4 text-emerald-400" />}{kind === "practice" ? "練習の優先候補" : "得意キャラの候補"}</CardTitle>
      <CardDescription>試合数と勝率の幅を考慮し、全体データが十分なら同条件でも比較</CardDescription></CardHeader>
    <CardContent className="space-y-3">
      {rows.length ? rows.map((row, index) => <button type="button" key={`${row.dimension}-${row.id}`} onClick={() => onSelect(row)} className="w-full rounded-xl border border-border/50 bg-secondary/15 p-3 text-left hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><span className="text-xs text-muted-foreground">{index + 1}</span><CharacterLabel name={row.label} /></span><span className={`text-sm font-bold ${kind === "practice" ? "text-amber-400" : "text-emerald-400"}`}>{row.basis === "personal" ? rate(row.win_rate) : points(row.gap)}</span></div>
        {row.map && <p className="mt-2 text-xs text-muted-foreground">{translateMap(row.map)} · {translateMode(row.mode || "")}</p>}
        <p className="mt-2 text-xs text-muted-foreground">{row.wins}勝 {row.losses}敗 · {row.basis === "personal" ? `個人成績からの候補 · 目安幅 ${row.interval_low}〜${row.interval_high}%` : `比較対象${row.comparison_matches}戦: 自分 ${rate(row.comparison_win_rate)} / 全体参考 ${rate(row.reference_win_rate)}`}</p>
        <p className="mt-1 text-xs text-muted-foreground">{row.basis === "personal" ? "全体との比較データは不足しています。押すと個人成績を確認できます。" : row.supported ? (kind === "practice" ? "負けた試合を振り返る候補。押すと詳細を確認できます。" : "同じ条件で継続して使う候補。押すと詳細を確認できます。") : "試合数による振れが残るため、候補として確認してください。"}</p>
      </button>) : <p className="text-sm leading-relaxed text-muted-foreground">条件を満たす候補はありません。キャラ別・マップ別の成績を確認し、戦績を同期してデータを蓄積しましょう。</p>}
    </CardContent>
  </Card>
}

function PairList({ rows, side }: { rows: AnalysisRow[]; side: "allies" | "opponents" }) {
  return <Card className={panelClass}><CardHeader><CardTitle className="flex items-center gap-2 text-base">{side === "allies" ? <Users className="size-4 text-emerald-400" /> : <Swords className="size-4 text-rose-400" />}{side === "allies" ? "味方にいるときの成績" : "敵にいるときの成績"}</CardTitle>
    <CardDescription>{side === "allies" ? "勝率の目安幅の下限が高い順" : "勝率の目安幅の上限が低い順"} · 最大10件</CardDescription></CardHeader>
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

  return <section aria-label="戦績分析" aria-busy={loading} className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="flex items-center gap-2 text-2xl font-bold"><BarChart3 className="size-6 text-primary" />戦績分析</h2><p className="mt-1 text-sm text-muted-foreground">蓄積した試合から、成長・改善点・編成との相性を確認</p></div>
      <Badge variant="outline">{type === "gachi" ? "ガチバトル" : type === "normal" ? "通常マッチ" : "通常＋ガチバトル"} · 直近{days}日</Badge>
    </div>
    <div className={`grid grid-cols-2 gap-3 rounded-xl border p-4 md:grid-cols-3 xl:grid-cols-5 ${panelClass}`}>
      <FilterSelect label="分析期間" value={days} onChange={setDays} options={[7, 30, 60].map(value => ({ value: String(value), label: `直近${value}日` }))} />
      <FilterSelect label="試合種別" value={type} onChange={value => { setType(value); resetContext() }} options={[{ value: "all", label: "通常＋ガチバトル" }, { value: "normal", label: "通常マッチ" }, { value: "gachi", label: "ガチバトル" }]} />
      <FilterSelect label="分析キャラ" value={hero} disabled={loading} onChange={setHero} options={[{ value: "all", label: "全キャラ" }, ...(data?.options.heroes || []).map(value => ({ value, label: getBrawlerInfo(value).nameJa }))]} />
      <FilterSelect label="分析モード" value={mode} disabled={loading} onChange={value => { setMode(value); setMap("all") }} options={[{ value: "all", label: "全モード" }, ...(data?.options.modes || []).map(value => ({ value, label: translateMode(value) }))]} />
      <FilterSelect label="分析マップ" value={map} disabled={loading} onChange={setMap} options={[{ value: "all", label: "全マップ" }, ...(data?.options.maps || []).map(value => ({ value, label: translateMap(value) }))]} />
      {(hero !== "all" || mode !== "all" || map !== "all") && <Button variant="ghost" size="sm" onClick={resetContext} className="col-span-2 justify-self-start text-xs md:col-span-3 xl:col-span-5">キャラ・モード・マップの絞り込みを解除</Button>}
    </div>
    {loading ? <div role="status" className="rounded-xl border border-border/50 p-12 text-center text-sm text-muted-foreground"><RefreshCw className="mx-auto mb-3 size-5 animate-spin" />保存済みの戦績を分析中…</div>
      : result.error ? <div role="alert" className="space-y-3 rounded-xl border border-destructive/30 p-6 text-center"><p className="text-sm">{result.error}</p><Button variant="outline" onClick={() => setRetry(value => value + 1)}>分析を再取得</Button></div>
      : data && <>
        {data.coverage.truncated && <p role="status" className="rounded-lg border border-amber-500/30 p-3 text-sm text-amber-400">保存済み戦績が多いため、最新10,000試合に限定して分析しています。</p>}
        {!data.coverage.reference_available && <p role="status" className="text-sm text-amber-400">全体の比較データを取得できていません。個人成績のみ表示しています。</p>}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[{ label: "勝率", value: rate(data.summary.win_rate), detail: `${data.summary.wins}勝 ${data.summary.losses}敗 ${data.summary.draws}分` },
            { label: "分析試合数", value: data.summary.matches.toLocaleString(), detail: `プレイ記録のある日：${data.summary.active_days}日` },
            { label: "期間内の最長連勝", value: `${data.summary.best_win_streak}連勝`, detail: "保存された試合の順序から集計" },
            { label: `前${data.trend.days}日との勝率差`, value: points(data.trend.delta), detail: data.trend.comparable ? `直近${data.trend.days}日 ${rate(data.trend.current.win_rate)} / 前${data.trend.days}日 ${rate(data.trend.previous.win_rate)}` : "両期間に勝敗の決まった10試合ずつが必要" }].map(item => <Card key={item.label} className={`gap-0 py-0 ${panelClass}`}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{item.label}</p><p className="mt-2 text-2xl font-black tabular-nums">{item.value}</p><p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{item.detail}</p></CardContent></Card>)}
        </div>
        <Tabs value={view} onValueChange={setView} className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 gap-1 bg-secondary/40 p-1 group-data-horizontal/tabs:h-auto sm:grid-cols-4">
            <TabsTrigger value="overview" className="h-10">成長・改善点</TabsTrigger><TabsTrigger value="characters" className="h-10">キャラ別</TabsTrigger><TabsTrigger value="contexts" className="h-10">モード・マップ</TabsTrigger><TabsTrigger value="pairs" className="h-10">味方・敵との相性</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="space-y-5">
            <Card className={panelClass}><CardHeader><CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="size-4 text-primary" />成績の推移</CardTitle><CardDescription>直近{data.trend.days}日：{data.trend.current.wins}勝 {data.trend.current.losses}敗 ／ 前{data.trend.days}日：{data.trend.previous.wins}勝 {data.trend.previous.losses}敗</CardDescription></CardHeader><CardContent><TrendChart timeline={data.timeline} /><p className="mt-3 text-xs leading-relaxed text-muted-foreground">対戦条件が変わると勝率も変わります。キャラ・モード・マップを絞ると同じ条件で推移を確認できます。</p></CardContent></Card>
            <div className="grid gap-4 lg:grid-cols-2"><Advice rows={data.practice} kind="practice" onSelect={row => focusRow(row, row.dimension || "character")} /><Advice rows={data.strengths} kind="strength" onSelect={row => focusRow(row, "character")} /></div>
          </TabsContent>
          <TabsContent value="characters" className="space-y-3"><h3 className="font-bold">キャラクター別の成績</h3><p className="text-xs leading-relaxed text-muted-foreground">全体参考は、自分が使ったキャラ・モード・マップ・試合種別と対応する集計です。平均との差はパーセントポイントで表示します。</p><StatsTable rows={data.characters} dimension="character" onSelect={row => focusRow(row, "character")} /></TabsContent>
          <TabsContent value="contexts" className="space-y-6"><div className="space-y-3"><h3 className="font-bold">モード別</h3><StatsTable rows={data.modes} dimension="mode" onSelect={row => focusRow(row, "mode")} /></div><div className="space-y-3"><h3 className="font-bold">マップ別</h3><StatsTable rows={data.maps} dimension="map" onSelect={row => focusRow(row, "map")} /></div><div className="space-y-3"><h3 className="font-bold">キャラ × マップ</h3><StatsTable rows={data.map_characters} dimension="map_character" onSelect={row => focusRow(row, "map_character")} /></div></TabsContent>
          <TabsContent value="pairs" className="space-y-4"><p className="text-sm leading-relaxed text-muted-foreground">勝敗が決まった3対3の{data.pair_matches}試合から集計。5対戦以上のキャラを表示します。味方・敵の編成全体やプレイヤーの影響を含む傾向です。自分のキャラ・モード・マップを絞って確認できます。</p><div className="grid gap-4 lg:grid-cols-2"><PairList rows={data.allies} side="allies" /><PairList rows={data.opponents} side="opponents" /></div></TabsContent>
        </Tabs>
        <div className="space-y-2 text-xs leading-relaxed text-muted-foreground">
          <p className="flex items-start gap-2"><Info className="mt-0.5 size-3.5 shrink-0" /><span>最大{data.coverage.history_days}日以内に保存した{data.coverage.retained_matches.toLocaleString()}試合が対象{data.coverage.earliest ? `（${dayLabel(data.coverage.earliest)}〜${dayLabel(data.coverage.latest!)}）` : ""}。同期で取得した履歴を蓄積しています。未取得の試合は含まれません。</span></p>
          <details><summary className="cursor-pointer py-2 font-medium">集計について</summary><p className="mt-1">フレンド戦を除き、引き分けは勝率の分母から除外します。勝率の目安幅が広いほど、少数試合による振れが大きくなります。連勝は保存された履歴上の値です。</p><p className="mt-2">全体参考は最大60日の試合を新しさで重み付けした値です。個人成績と期間・プレイヤー層は異なります。対応する比較データが個人戦績の80%未満の場合は「—」を表示します。平均との差は、対応データがある自分の試合だけで計算します。練習・得意候補は比較対象となる10試合以上から抽出し、少数試合の差を弱めて評価しています。全体比較が不足するときは、目安幅が50%を上回る得意候補、3対3で50%を下回るキャラとマップの練習候補を、個人成績から表示します。</p></details>
        </div>
      </>}
  </section>
}
