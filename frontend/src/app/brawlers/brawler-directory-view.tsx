"use client"

import { useState } from "react"
import Link from "@/components/document-link"
import Image from "next/image"
import { ArrowLeft, Search, Users, X } from "lucide-react"
import type { brawlerEntries, Cohort } from "@/lib/brawler-page-data"
import { brawlerRarityLabel, directorySorts, filterAndSortBrawlers, type DirectorySort } from "@/lib/brawler-directory"

const controlStyle = "h-11 w-full rounded-xl border text-sm outline-none transition-colors"

export default function BrawlerDirectoryView({ entries }: { entries: ReturnType<typeof brawlerEntries> }) {
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<DirectorySort>("japanese")
  const [cohort, setCohort] = useState<Cohort>("global")
  const [rarityFilter, setRarityFilter] = useState<number | "all">("all")

  const rarityOptions = Array.from(
    entries.reduce((map, entry) => {
      if (entry.rarity?.id != null && !map.has(entry.rarity.id)) {
        map.set(entry.rarity.id, brawlerRarityLabel(entry))
      }
      return map
    }, new Map<number, string>())
  ).sort((a, b) => a[0] - b[0])

  const sortedAndSearched = filterAndSortBrawlers(entries, query, sort, cohort)
  const visible = rarityFilter === "all"
    ? sortedAndSearched
    : sortedAndSearched.filter((entry) => entry.rarity?.id === rarityFilter)

  return (
    <div className="arena-workspace arena-directory max-w-7xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="arena-dir-header">
        <div className="space-y-1.5 min-w-0">
          <nav aria-label="パンくず" className="text-xs text-muted-foreground">
            <Link href="/" className="hover:text-primary">ホーム</Link>
            <span aria-hidden="true"> / </span>
            <span aria-current="page">キャラ一覧</span>
          </nav>
          <p className="arena-dir-eyebrow">JEWEL RARITY DIRECTORY</p>
          <h1 className="flex items-center gap-2.5 text-2xl sm:text-3xl font-extrabold tracking-tight">
            <Users aria-hidden="true" className="w-7 h-7 shrink-0" />
            <span className="tabular-nums">キャラ一覧 ({visible.length} / {entries.length})</span>
          </h1>
        </div>

        <div className="arena-tier-seg-group shrink-0" role="group" aria-label="集計対象切替">
          <button
            type="button"
            className={`arena-tier-seg-btn ${cohort === "global" ? "is-active" : ""}`}
            aria-pressed={cohort === "global"}
            onClick={() => setCohort("global")}
          >
            全体
          </button>
          <button
            type="button"
            className={`arena-tier-seg-btn ${cohort === "gachi" ? "is-active" : ""}`}
            aria-pressed={cohort === "gachi"}
            onClick={() => setCohort("gachi")}
          >
            ガチバトル
          </button>
        </div>
      </header>

      <section aria-label="キャラを探す" className="arena-dir-filterbar space-y-3">
        <div className="arena-dir-controls">
          <div className="relative flex-1 min-w-0">
            <label htmlFor="brawler-search" className="sr-only">キャラ名を検索</label>
            <Search aria-hidden="true" className="absolute left-3.5 top-3.5 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              id="brawler-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="キャラ名で検索（日本語・英語）"
              autoComplete="off"
              className={`${controlStyle} pl-10 pr-11 [&::-webkit-search-cancel-button]:appearance-none`}
            />
            {query && (
              <button
                type="button"
                aria-label="検索をクリア"
                onClick={() => setQuery("")}
                className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
              >
                <X aria-hidden="true" className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="w-full sm:w-56 shrink-0">
            <label htmlFor="brawler-sort" className="sr-only">並び替え</label>
            <select
              id="brawler-sort"
              value={sort}
              onChange={(event) => setSort(event.target.value as DirectorySort)}
              className={`${controlStyle} px-3`}
            >
              {Object.entries(directorySorts).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="arena-dir-rarity-pills" role="group" aria-label="レア度フィルター">
          <button
            type="button"
            className={`arena-tier-seg-btn ${rarityFilter === "all" ? "is-active" : ""}`}
            aria-pressed={rarityFilter === "all"}
            onClick={() => setRarityFilter("all")}
          >
            すべて
          </button>
          {rarityOptions.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`arena-tier-seg-btn ${rarityFilter === id ? "is-active" : ""}`}
              aria-pressed={rarityFilter === id}
              onClick={() => setRarityFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <p role="status" aria-live="polite" className="sr-only">{visible.length} / {entries.length}キャラ</p>
        {sort === "win_rate" && <p className="text-xs text-muted-foreground">データ不足のキャラは末尾に表示</p>}
      </section>

      <div className="arena-jewel-grid">
        {visible.map((entry) => {
          const rarity = brawlerRarityLabel(entry)
          const tier = entry.tiers?.[cohort] || "N/A"
          const stats = entry.directoryStats[cohort]
          const wrClass = stats && stats.sample_sufficient
            ? stats.win_rate >= 53
              ? "is-high"
              : stats.win_rate >= 50
                ? "is-mid"
                : "is-low"
            : "is-low"

          return (
            <Link
              key={entry.slug}
              prefetch={false}
              href={`/brawlers/${entry.slug}`}
              title={rarity}
              data-rarity={entry.rarity?.id ?? "unknown"}
              className="arena-jewel-card group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <div className="arena-jewel-top">
                <span className="arena-tier-badge" data-tier={tier}>{tier}</span>
                {stats && (
                  <span className={`arena-jewel-wr-chip ${wrClass}`}>
                    {stats.sample_sufficient ? `${stats.win_rate.toFixed(1)}%` : "データ不足"}
                  </span>
                )}
              </div>

              <div className="arena-jewel-art">
                {entry.imageUrl ? (
                  <Image src={entry.imageUrl} alt="" width={112} height={112} />
                ) : (
                  <span className="arena-jewel-fallback" aria-hidden="true">
                    {entry.nameJa.slice(0, 2)}
                  </span>
                )}
              </div>

              <span aria-hidden="true" className="arena-jewel-scrim" />

              <div className="arena-jewel-footer">
                <span className="arena-jewel-name block">{entry.nameJa}</span>
                <span className="sr-only">レア度：{rarity}</span>
                {stats && (
                  <span className="arena-jewel-sub">
                    <span>使用率 {stats.use_rate.toFixed(2)}%</span>
                  </span>
                )}
              </div>
            </Link>
          )
        })}
      </div>

      {!visible.length && (
        <div className="py-10 text-center space-y-3 rounded-2xl border border-dashed border-white/15 bg-white/[0.02]">
          <p className="text-sm text-muted-foreground">一致するキャラが見つかりません</p>
          <button
            type="button"
            onClick={() => {
              setQuery("")
              setRarityFilter("all")
            }}
            className="text-sm font-bold text-primary hover:underline"
          >
            条件をクリア
          </button>
        </div>
      )}

      <nav aria-label="関連ランキング" className="flex flex-wrap items-center gap-5 text-sm text-primary pt-2">
        <Link href="/modes" className="hover:underline">モード別ランキング</Link>
        <Link href="/maps" className="hover:underline">マップ別ランキング</Link>
        <Link href="/tier" className="inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline transition-colors">
          <ArrowLeft aria-hidden="true" className="w-4 h-4" />Tier表に戻る
        </Link>
      </nav>
    </div>
  )
}
