"use client"

import { useState } from "react"
import Link from "@/components/document-link"
import Image from "next/image"
import { ArrowRight, MapPin, Trophy } from "lucide-react"
import type { Cohort } from "@/lib/brawler-page-data"
import { conditionBreadcrumbs, MODE_SLUGS, type ConditionEntry, type ConditionIndex, type ConditionPageData } from "@/lib/condition-pages"
import { getModeIconUrl, translateMode } from "@/lib/translations"
import { countMapsByMode, filterMapsByMode, getMapImageUrl } from "@/lib/maps"
import { useMapCatalog } from "@/lib/use-map-catalog"
import { conditionSummary } from "@/lib/page-insights"
import { conditionFaq } from "@/lib/faq"
import { DataSummary } from "@/components/data-summary"
import { FaqSection } from "@/components/faq-section"

const card = "rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-6"
const heading = "text-xl sm:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-primary via-purple-400 to-cyan-400 bg-clip-text text-transparent"

function entryMapName(entry: ConditionEntry): string {
  return entry.ids.global || entry.ids.gachi || entry.label
}

function Breadcrumbs({ entry, kind }: { entry?: ConditionEntry; kind: "modes" | "maps" }) {
  const items = conditionBreadcrumbs(entry, kind)
  return <nav aria-label="パンくず" className="flex flex-wrap gap-2 text-xs text-muted-foreground">{items.map((item, i) => <span key={item.path} className="inline-flex gap-2">
    {i > 0 && <span aria-hidden="true">/</span>}{i === items.length - 1 ? <span aria-current="page">{item.name}</span> : <Link prefetch={false} className="hover:text-primary" href={item.path}>{item.name}</Link>}
  </span>)}</nav>
}

function ModeIcons({ entry }: { entry: ConditionEntry }) {
  return <span className="flex flex-wrap gap-2">{entry.modeIds.map(id => <span key={id} className="inline-flex items-center gap-1 text-xs text-muted-foreground">
    <Image src={getModeIconUrl(id)} alt="" width={20} height={20} className="w-5 h-5 object-contain" />{entry.kind === "maps" && translateMode(id)}
  </span>)}</span>
}

function MapPreview({ entry, prioritize = false, compact = false }: { entry: ConditionEntry; prioritize?: boolean; compact?: boolean }) {
  const imageUrl = getMapImageUrl(entryMapName(entry))
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const showImage = Boolean(imageUrl) && failedUrl !== imageUrl
  const primaryMode = entry.modeIds[0]

  return (
    <div className={`arena-map-preview${compact ? " is-compact" : ""}`}>
      {showImage ? (
        <Image
          src={imageUrl}
          alt={`${entry.label}のマップ画像`}
          width={compact ? 180 : 240}
          height={compact ? 240 : 320}
          priority={prioritize}
          fetchPriority={prioritize ? "high" : undefined}
          onError={() => setFailedUrl(imageUrl)}
          className="arena-map-preview-img"
        />
      ) : (
        <div className="arena-map-preview-fallback">
          {primaryMode ? (
            <Image src={getModeIconUrl(primaryMode)} alt="" width={40} height={40} className="w-10 h-10 object-contain opacity-80" />
          ) : (
            <MapPin aria-hidden="true" className="w-8 h-8 text-cyan-400/70" />
          )}
          <span>マップ画像準備中</span>
        </div>
      )}
    </div>
  )
}

function EntryLinks({ entries, prioritizeFirst = false }: { entries: ConditionEntry[]; prioritizeFirst?: boolean }) {
  const isMaps = entries.length > 0 && entries[0].kind === "maps"
  if (!isMaps) {
    return <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{entries.map(entry => <li key={entry.path}>
      <Link prefetch={false} href={entry.path} className="group flex items-center gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 hover:border-purple-500/40 hover:bg-primary/5 transition-colors h-full">
        <span className="min-w-0 space-y-1"><span className="block font-bold text-zinc-200 group-hover:text-primary">{entry.label}</span><ModeIcons entry={entry} /></span><ArrowRight aria-hidden="true" className="w-4 h-4 ml-auto shrink-0 text-muted-foreground" />
      </Link>
    </li>)}</ul>
  }

  return (
    <ul className="arena-map-browse-grid">
      {entries.map((entry, idx) => (
        <li key={entry.path} className={idx >= 6 ? "arena-map-list-item-deferred" : undefined}>
          <Link prefetch={false} href={entry.path} className="arena-map-browse-card group">
            <MapPreview entry={entry} prioritize={prioritizeFirst && idx < 2} />
            <div className="arena-map-browse-meta">
              <div className="min-w-0 space-y-1.5">
                <span className="block font-extrabold text-sm sm:text-base text-zinc-100 group-hover:text-primary transition-colors truncate">{entry.label}</span>
                <ModeIcons entry={entry} />
              </div>
              <ArrowRight aria-hidden="true" className="w-4 h-4 ml-auto shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function ConditionDirectoryView({ index, kind }: { index: ConditionIndex; kind: "modes" | "maps" }) {
  useMapCatalog()
  const [selectedMode, setSelectedMode] = useState<string>("all")

  const modeCounts = kind === "maps" ? countMapsByMode(index.maps) : {}
  const modeOptions = kind === "maps"
    ? Object.keys(MODE_SLUGS).filter(modeId => (modeCounts[modeId] || 0) > 0)
    : []
  const visibleEntries = kind === "maps" ? filterMapsByMode(index.maps, selectedMode) : index.modes

  return <div className="arena-workspace arena-conditions space-y-3.5 sm:space-y-8"><Breadcrumbs kind={kind} /><h1 className={heading}>{kind === "modes" ? "モード別キャラランキング" : "マップ別キャラランキング"}</h1>
    {index[kind].length > 0 && <p className="text-xs sm:text-sm leading-snug sm:leading-relaxed text-muted-foreground">{index[kind].length}{kind === "modes" ? "モード" : "マップ（ステージ）"}ごとに、全体とガチバトル（エリート以上）のキャラ別勝率・使用率ランキングを掲載しています。</p>}
    <div className="flex flex-wrap gap-2.5 sm:gap-3 text-sm font-bold"><Link prefetch={false} href="/modes" aria-current={kind === "modes" ? "page" : undefined} className="inline-flex items-center min-h-10 sm:min-h-11 rounded-lg border border-primary/20 px-4 py-1.5 sm:py-2 text-primary hover:bg-primary/10">モード一覧</Link><Link prefetch={false} href="/maps" aria-current={kind === "maps" ? "page" : undefined} className="inline-flex items-center min-h-10 sm:min-h-11 rounded-lg border border-cyan-500/20 px-4 py-1.5 sm:py-2 text-cyan-400 hover:bg-cyan-500/10">マップ一覧</Link></div>
    {kind === "maps" && modeOptions.length > 0 && (
      <section aria-label="モードでマップを絞り込む" className="arena-dir-filterbar">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-300">モードで絞り込み</span>
          <span className="text-xs font-bold text-slate-300 tabular-nums">
            表示中 {visibleEntries.length} / {index.maps.length}マップ
          </span>
        </div>
        <div className="arena-tier-seg-group arena-map-mode-pills arena-hscroll-fade" role="group" aria-label="モードフィルター">
          <button
            type="button"
            className={`arena-tier-seg-btn ${selectedMode === "all" ? "is-active" : ""}`}
            aria-pressed={selectedMode === "all"}
            onClick={() => setSelectedMode("all")}
          >
            <span>すべて</span>
            <span className="opacity-75 tabular-nums">({index.maps.length})</span>
          </button>
          {modeOptions.map(modeId => (
            <button
              key={modeId}
              type="button"
              className={`arena-tier-seg-btn ${selectedMode === modeId ? "is-active" : ""}`}
              aria-pressed={selectedMode === modeId}
              onClick={() => setSelectedMode(modeId)}
            >
              <Image src={getModeIconUrl(modeId)} alt="" width={16} height={16} className="w-4 h-4 object-contain shrink-0" />
              <span>{translateMode(modeId)}</span>
              <span className="opacity-75 tabular-nums">({modeCounts[modeId]})</span>
            </button>
          ))}
        </div>
        <p role="status" aria-live="polite" className="sr-only">{visibleEntries.length} / {index.maps.length}マップ</p>
      </section>
    )}
    {visibleEntries.length > 0 ? (
      <EntryLinks entries={visibleEntries} prioritizeFirst={kind === "maps"} />
    ) : (
      <div className="py-10 text-center space-y-3 rounded-2xl border border-dashed border-white/15 bg-white/[0.02]">
        <p className="text-sm text-muted-foreground">選択したモードのマップが見つかりません</p>
        <button type="button" onClick={() => setSelectedMode("all")} className="text-sm font-bold text-primary hover:underline">
          すべてのマップを表示
        </button>
      </div>
    )}
  </div>
}

export function ConditionDetailView({ data }: { data: ConditionPageData }) {
  useMapCatalog()
  const [selected, setSelected] = useState<Cohort>(data.cohorts.global.rows.length ? "global" : "gachi")
  const hasMapPreview = data.entry.kind === "maps" && Boolean(getMapImageUrl(entryMapName(data.entry)))

  return <div className="arena-workspace arena-conditions space-y-4 sm:space-y-8"><Breadcrumbs entry={data.entry} kind={data.entry.kind} />
    <header className={hasMapPreview ? "flex flex-col sm:flex-row sm:items-start gap-5" : "space-y-3"}>
      {hasMapPreview && (
        <div className="w-full sm:w-44 shrink-0">
          <MapPreview entry={data.entry} prioritize compact />
        </div>
      )}
      <div className="space-y-3 min-w-0 flex-1">
        <h1 className={`${heading} flex items-center gap-3`}>{data.entry.kind === "modes" && <Image src={getModeIconUrl(data.entry.modeIds[0])} alt="" width={40} height={40} className="w-10 h-10 object-contain shrink-0 drop-shadow-md" />}<span>{data.entry.label}のキャラランキング</span></h1>
        {data.entry.kind === "maps" && <ModeIcons entry={data.entry} />}
        <DataSummary summary={conditionSummary(data)} />
      </div>
    </header>
    <div role="tablist" aria-label="集計対象" className="grid grid-cols-2 gap-1.5 max-w-[600px] mx-auto rounded-xl bg-card/80 border border-border/50 p-1.5">
      {(["global", "gachi"] as const).map(type => <button key={type} type="button" role="tab" id={`${type}-tab`} aria-selected={selected === type} aria-controls={`${type}-panel`} tabIndex={selected === type ? 0 : -1} onClick={() => setSelected(type)}
        onKeyDown={event => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; event.preventDefault(); const next = event.key === "Home" ? "global" : event.key === "End" ? "gachi" : selected === "global" ? "gachi" : "global"; setSelected(next); document.getElementById(`${next}-tab`)?.focus() }}
        className={`min-h-11 rounded-lg px-2 py-2.5 text-sm font-bold leading-snug transition-colors ${selected === type ? "bg-secondary/60 text-foreground" : "text-muted-foreground hover:bg-secondary/30"}`}>{type === "global" ? "全体" : "ガチバトル（エリート以上）"}</button>)}
    </div>
    {(["global", "gachi"] as const).map(type => <section key={type} role="tabpanel" id={`${type}-panel`} aria-labelledby={`${type}-tab`} hidden={selected !== type} className={card}>
      <h2 className="flex items-center gap-2 font-bold text-lg"><Trophy aria-hidden="true" className="w-5 h-5 text-yellow-500" />最強キャラ・勝率</h2>
      {data.cohorts[type].updatedAt && <p className="text-xs text-muted-foreground mt-2">最終更新：<time dateTime={data.cohorts[type].updatedAt!}>{new Date(data.cohorts[type].updatedAt!).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}（日本時間）</time></p>}
      {data.cohorts[type].rows.length ? <div tabIndex={0} role="region" aria-label={`${data.entry.label}の最強キャラ・勝率ランキング`} className="arena-table-wrap is-sticky-brawler arena-hscroll-fade mt-3"><table className="w-full text-sm"><thead><tr className="text-xs text-muted-foreground border-b border-border/50">
        {["順位", "キャラ", "勝率", "使用率", "集計件数"].map((name, i) => <th key={name} scope="col" className={`py-3 px-2 font-medium whitespace-nowrap ${i < 2 ? "text-left" : "text-right"}`}>{name}</th>)}
      </tr></thead><tbody>{data.cohorts[type].rows.map((row, i) => <tr key={row.slug} className="border-b border-border/30 last:border-0 hover:bg-primary/5">
        <td className="py-3 px-2 font-black text-primary tabular-nums">{row.sample_sufficient ? i + 1 : "—"}</td>
        <th scope="row" className="py-2 sm:py-3 px-2 text-left"><Link prefetch={false} href={`/brawlers/${row.slug}`} className="inline-flex items-center min-h-10 sm:min-h-0 gap-2 font-bold hover:text-primary whitespace-nowrap">{row.imageUrl && <Image src={row.imageUrl} alt="" width={32} height={32} loading="lazy" className="w-8 h-8 rounded-lg border border-primary/20" />}{row.nameJa}</Link></th>
        <td className={`py-3 px-2 text-right font-black tabular-nums ${row.win_rate >= 50 ? "text-green-500" : "text-orange-500"}`}>{row.win_rate.toFixed(1)}%{!row.sample_sufficient && <span className="block text-[10px] font-normal text-muted-foreground whitespace-nowrap">データ不足</span>}</td>
        <td className="py-3 px-2 text-right tabular-nums whitespace-nowrap">{row.use_rate.toFixed(2)}%</td><td className="py-3 px-2 text-right tabular-nums text-muted-foreground">{row.total_matches.toLocaleString("ja-JP")}</td>
      </tr>)}</tbody></table></div> : <p className="py-6 text-sm text-muted-foreground">データ不足</p>}
    </section>)}
    {data.related.length > 0 && <section className="space-y-3"><h2 className="font-bold text-lg flex items-center gap-2"><MapPin aria-hidden="true" className="w-5 h-5 text-cyan-400" />{data.entry.kind === "modes" ? "マップ別ランキング" : "モード別ランキング"}</h2><EntryLinks entries={data.related} /></section>}
    <nav aria-label="関連ツール" className="flex flex-wrap gap-x-5 gap-y-1 text-sm font-bold text-primary">
      <Link href="/tier" className="inline-flex items-center min-h-10 sm:min-h-0 py-1 hover:underline">Tier表</Link>
      <Link href="/companion" className="inline-flex items-center min-h-10 sm:min-h-0 py-1 hover:underline">BAN・ピックツール</Link>
    </nav>
    <FaqSection id="faq-condition" items={conditionFaq(data)} />
  </div>
}
