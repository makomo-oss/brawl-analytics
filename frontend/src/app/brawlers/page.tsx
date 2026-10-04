import Link from "next/link"
import Image from "next/image"
import { getBrawlerEntries } from "@/lib/server-brawler-pages"
import { pageMetadata } from "@/lib/seo"

export const metadata = pageMetadata("ブロスタ キャラ一覧・勝率と相性", "ブロスタのキャラ別Tier・勝率・使用率・おすすめマップ・敵味方との相性を対戦データで確認。各キャラの分析ページを一覧から探せます。", "/brawlers")

export default async function Page() {
  const entries = await getBrawlerEntries()
  return <div className="max-w-6xl mx-auto space-y-6">
    <nav aria-label="パンくず" className="text-xs text-muted-foreground"><Link href="/" className="hover:text-primary">ホーム</Link><span aria-hidden="true"> / </span><span aria-current="page">キャラ一覧</span></nav>
    <h1 className="text-2xl sm:text-3xl font-black">キャラ一覧</h1>
    <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-7 gap-3">
      {entries.map(entry => <Link key={entry.slug} prefetch={false} href={`/brawlers/${entry.slug}`} className="flex flex-col items-center gap-2 rounded-xl border border-border/60 bg-card p-3 hover:border-primary/50 transition-colors">
        {entry.imageUrl && <Image src={entry.imageUrl} alt={entry.nameJa} width={56} height={56} className="rounded-lg" />}
        <span className="text-xs sm:text-sm font-medium text-center">{entry.nameJa}</span>
      </Link>)}
    </div>
    <Link href="/tier" className="inline-block text-sm font-medium text-primary">Tier表に戻る</Link>
  </div>
}
