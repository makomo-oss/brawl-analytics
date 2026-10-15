import Link from "@/components/document-link"
import { ArrowRight, Search, Swords, Trophy, Users } from "lucide-react"

export function FeatureEntrances() {
  return <nav aria-label="攻略・分析ツール" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
    {[
      { href: "/player", label: "戦績検索", Icon: Search },
      { href: "/tier", label: "Tier表", Icon: Trophy },
      { href: "/brawlers", label: "キャラ一覧", Icon: Users },
      { href: "/companion", label: "BAN・ピックツール", Icon: Swords },
    ].map(({ href, label, Icon }) => <div key={href} className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 hover:border-purple-500/40 transition-colors">
      <Link href={href} className="flex h-full min-h-24 items-center gap-2 p-3 sm:p-4 font-bold text-sm text-zinc-100 hover:text-primary">
        <Icon aria-hidden="true" className="w-5 h-5 text-primary shrink-0" /><span>{label}</span><ArrowRight aria-hidden="true" className="w-4 h-4 ml-auto shrink-0" />
      </Link>
    </div>)}
    <div className="col-span-2 lg:col-span-4 flex justify-center gap-4 text-sm font-bold text-primary">
      <Link href="/modes" className="px-2 py-2 hover:underline">モード別ランキング</Link>
      <Link href="/maps" className="px-2 py-2 hover:underline">マップ別ランキング</Link>
    </div>
  </nav>
}

export function RankingNav({ current }: { current: "tier" | "modes" | "maps" }) {
  return <nav aria-label="ランキングの種類" className="flex flex-wrap gap-2 text-sm font-bold">
    {[["tier", "総合"], ["modes", "モード別"], ["maps", "マップ別"]].map(([key, label]) =>
      <Link key={key} href={`/${key}`} aria-current={current === key ? "page" : undefined} className={`rounded-lg border px-4 py-2 transition-colors ${current === key ? "border-primary/50 bg-primary/15 text-primary" : "border-zinc-800 text-muted-foreground hover:text-primary hover:border-primary/30"}`}>{label}</Link>)}
  </nav>
}
