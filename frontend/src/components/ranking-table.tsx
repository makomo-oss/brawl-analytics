import Link from "@/components/document-link"
import type { RankedRow } from "@/lib/page-insights"

// Compact crawlable ranking that reuses the condition-page table styling.
export function RankingTable({ id, title, rows }: { id: string; title: string; rows: RankedRow[] }) {
  if (!rows.length) return null
  return <section aria-labelledby={`${id}-title`} className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-6 min-w-0">
    <h2 id={`${id}-title`} className="font-bold text-lg">{title}</h2>
    <div tabIndex={0} role="region" aria-labelledby={`${id}-title`} className="arena-table-wrap is-sticky-brawler arena-hscroll-fade mt-3"><table className="w-full text-sm"><thead><tr className="text-xs text-muted-foreground border-b border-border/50">
      {["順位", "キャラ", "Tier", "勝率", "使用率", "集計件数"].map((name, i) => <th key={name} scope="col" className={`py-3 px-2 font-medium whitespace-nowrap ${i < 2 ? "text-left" : "text-right"}`}>{name}</th>)}
    </tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-b border-border/30 last:border-0 hover:bg-primary/5">
      <td className="py-3 px-2 font-black text-primary tabular-nums">{row.rank}</td>
      <th scope="row" className="py-2 sm:py-3 px-2 text-left"><Link prefetch={false} href={`/brawlers/${row.slug}`} className="inline-flex items-center min-h-10 sm:min-h-0 font-bold hover:text-primary whitespace-nowrap">{row.name}</Link></th>
      <td className="py-3 px-2 text-right font-bold whitespace-nowrap">{row.tier}</td>
      <td className={`py-3 px-2 text-right font-black tabular-nums ${row.winRate >= 50 ? "text-green-500" : "text-orange-500"}`}>{row.winRate.toFixed(1)}%</td>
      <td className="py-3 px-2 text-right tabular-nums whitespace-nowrap">{row.useRate.toFixed(2)}%</td>
      <td className="py-3 px-2 text-right tabular-nums text-muted-foreground">{row.matches.toLocaleString("ja-JP")}</td>
    </tr>)}</tbody></table></div>
  </section>
}
