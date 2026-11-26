import Link from "next/link"
import type { Metadata } from "next"
import { SITE_SECTIONS } from "@/lib/site-sections"

export const metadata: Metadata = {
  title: "ページが見つかりません",
  description: "お探しのページは移動または削除された可能性があります。ブロラボの主要ツールから目的のページをご覧ください。",
  robots: { index: false, follow: true, googleBot: { index: false, follow: true } },
}

export default function NotFound() {
  return (
    <div className="arena-workspace max-w-2xl mx-auto py-12 space-y-6 text-center">
      <p className="text-xs font-bold tracking-widest text-muted-foreground">404 NOT FOUND</p>
      <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight">ページが見つかりません</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        URLが変更されたか、集計期間外のため掲載が終了したページです。以下の主要ページから目的の情報をお探しください。
      </p>
      <nav aria-label="主要ページ" className="grid sm:grid-cols-2 gap-3 text-left pt-2">
        <Link href="/" className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 hover:border-primary/40 transition-colors">
          <span className="block font-bold text-sm text-zinc-100">ホーム</span>
          <span className="block text-xs text-muted-foreground mt-1">プレイヤー戦績検索と今日のガチバトル環境速報</span>
        </Link>
        {SITE_SECTIONS.map((section) => (
          <Link key={section.path} href={section.path} className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 hover:border-primary/40 transition-colors">
            <span className="block font-bold text-sm text-zinc-100">{section.label}</span>
            <span className="block text-xs text-muted-foreground mt-1">{section.description}</span>
          </Link>
        ))}
      </nav>
    </div>
  )
}
