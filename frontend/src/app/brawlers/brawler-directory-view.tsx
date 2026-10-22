"use client"

import { useState } from "react"
import Link from "@/components/document-link"
import Image from "next/image"
import { ArrowLeft, Search, Users, X } from "lucide-react"
import type { brawlerEntries, Cohort } from "@/lib/brawler-page-data"
import { brawlerRarityLabel, directorySorts, filterAndSortBrawlers, type DirectorySort } from "@/lib/brawler-directory"

const controlStyle = "h-11 w-full rounded-xl border border-zinc-700/80 bg-zinc-950/70 text-sm text-zinc-200 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-colors"
export default function BrawlerDirectoryView({ entries }: { entries: ReturnType<typeof brawlerEntries> }) {
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<DirectorySort>("japanese")
  const [cohort, setCohort] = useState<Cohort>("global")
  const statistical = sort === "win_rate" || sort === "use_rate"
  const visible = filterAndSortBrawlers(entries, query, sort, cohort)
  return <div className="arena-workspace arena-directory max-w-7xl mx-auto space-y-6 sm:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
    <nav aria-label="パンくず" className="text-xs text-muted-foreground"><Link href="/" className="hover:text-primary">ホーム</Link><span aria-hidden="true"> / </span><span aria-current="page">キャラ一覧</span></nav>
    <h1 className="flex items-center gap-3 text-2xl sm:text-4xl font-extrabold tracking-tight"><Users aria-hidden="true" className="w-8 h-8 text-cyan-400" /><span className="bg-gradient-to-r from-primary via-purple-400 to-cyan-400 bg-clip-text text-transparent">キャラ一覧</span></h1>
    <section aria-label="キャラを探す" className="space-y-3 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-md p-4 sm:p-5">
      <div className={`grid sm:grid-cols-2 gap-3 ${statistical ? "lg:grid-cols-[minmax(0,1fr)_15rem_15rem]" : "lg:grid-cols-[minmax(0,1fr)_17rem]"}`}>
        <div className="relative sm:col-span-2 lg:col-span-1">
          <label htmlFor="brawler-search" className="sr-only">キャラ名を検索</label>
          <Search aria-hidden="true" className="absolute left-3 top-3.5 w-4 h-4 text-purple-400 pointer-events-none" />
          <input id="brawler-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="キャラ名で検索（日本語・英語）" autoComplete="off" className={`${controlStyle} pl-10 pr-11 [&::-webkit-search-cancel-button]:appearance-none`} />
          {query && <button type="button" aria-label="検索をクリア" onClick={() => setQuery("")} className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-xl text-zinc-400 hover:text-white focus-visible:outline-2 focus-visible:outline-purple-500"><X aria-hidden="true" className="w-4 h-4" /></button>}
        </div>
        <div>
          <label htmlFor="brawler-sort" className="sr-only">並び替え</label>
          <select id="brawler-sort" value={sort} onChange={event => setSort(event.target.value as DirectorySort)} className={`${controlStyle} px-3`}>
            {Object.entries(directorySorts).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        {statistical && <div>
          <label htmlFor="brawler-cohort" className="sr-only">集計対象</label>
          <select id="brawler-cohort" value={cohort} onChange={event => setCohort(event.target.value as Cohort)} className={`${controlStyle} px-3`}>
            <option value="global">全体</option><option value="gachi">ガチバトル（エリート以上）</option>
          </select>
        </div>}
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <p role="status" aria-live="polite">{visible.length} / {entries.length}キャラ</p>
        {sort === "win_rate" && <p>データ不足のキャラは末尾に表示</p>}
      </div>
    </section>
    <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-7 gap-3">
      {visible.map(entry => {
        const rarity = brawlerRarityLabel(entry)
        return <Link key={entry.slug} prefetch={false} href={`/brawlers/${entry.slug}`} title={rarity} data-rarity={entry.rarity?.id ?? "unknown"} className="arena-directory-card group relative overflow-hidden flex flex-col items-center gap-3 rounded-2xl border backdrop-blur-md p-3 sm:p-4 hover:-translate-y-1 hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white transition-all duration-300">
        {entry.imageUrl && <Image src={entry.imageUrl} alt="" width={56} height={56} className="w-14 h-14 rounded-xl shadow-md transition-transform duration-300 group-hover:scale-105" />}
        <span className="text-xs sm:text-sm font-bold text-zinc-200 group-hover:text-white text-center transition-colors">{entry.nameJa}</span>
        <span className="arena-rarity-label"><span className="sr-only">レア度：</span>{entry.rarity?.id === 7 ? <>ウルトラ<wbr />レジェンドレア</> : rarity}</span>
        {statistical && <span className="text-xs font-bold tabular-nums text-cyan-400 text-center">{(() => {
          const stats = entry.directoryStats[cohort]
          if (!stats) return "データなし"
          const value = sort === "use_rate" ? stats.use_rate.toFixed(2) : stats.win_rate.toFixed(1)
          return <>{value}%{sort === "win_rate" && !stats.sample_sufficient && <span className="block text-[10px] font-normal text-muted-foreground">データ不足</span>}</>
        })()}</span>}
      </Link>})}
    </div>
    {!visible.length && <div className="py-8 text-center space-y-3"><p className="text-sm text-muted-foreground">一致するキャラが見つかりません</p><button type="button" onClick={() => setQuery("")} className="text-sm font-bold text-primary hover:text-purple-300">検索をクリア</button></div>}
    <Link href="/tier" className="inline-flex items-center gap-2 text-sm font-bold text-primary hover:text-purple-300 transition-colors"><ArrowLeft aria-hidden="true" className="w-4 h-4" />Tier表に戻る</Link>
  </div>
}
