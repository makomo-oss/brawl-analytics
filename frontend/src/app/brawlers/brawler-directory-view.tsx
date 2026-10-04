import Link from "next/link"
import Image from "next/image"
import { ArrowLeft, Users } from "lucide-react"
import type { brawlerEntries } from "@/lib/brawler-page-data"

export default function BrawlerDirectoryView({ entries }: { entries: ReturnType<typeof brawlerEntries> }) {
  return <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
    <nav aria-label="パンくず" className="text-xs text-muted-foreground"><Link href="/" className="hover:text-primary">ホーム</Link><span aria-hidden="true"> / </span><span aria-current="page">キャラ一覧</span></nav>
    <h1 className="flex items-center gap-3 text-2xl sm:text-4xl font-extrabold tracking-tight"><Users aria-hidden="true" className="w-8 h-8 text-cyan-400" /><span className="bg-gradient-to-r from-primary via-purple-400 to-cyan-400 bg-clip-text text-transparent">キャラ一覧</span></h1>
    <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-7 gap-3">
      {entries.map(entry => <Link key={entry.slug} prefetch={false} href={`/brawlers/${entry.slug}`} className="group flex flex-col items-center gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-md p-3 sm:p-4 hover:bg-purple-950/20 hover:border-purple-500/40 hover:-translate-y-1 hover:shadow-xl hover:shadow-purple-500/10 transition-all duration-300">
        {entry.imageUrl && <Image src={entry.imageUrl} alt={entry.nameJa} width={56} height={56} className="w-14 h-14 rounded-xl shadow-md transition-transform duration-300 group-hover:scale-105" />}
        <span className="text-xs sm:text-sm font-bold text-zinc-200 group-hover:text-white text-center transition-colors">{entry.nameJa}</span>
      </Link>)}
    </div>
    <Link href="/tier" className="inline-flex items-center gap-2 text-sm font-bold text-primary hover:text-purple-300 transition-colors"><ArrowLeft aria-hidden="true" className="w-4 h-4" />Tier表に戻る</Link>
  </div>
}
