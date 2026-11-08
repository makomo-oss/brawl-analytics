import Link from "@/components/document-link"
import type { FaqItem } from "@/lib/faq"

// Closed by default and without height animation so adding it never shifts
// the existing layout. Hook-free: works in Server Components, client views
// and the Worker's renderToString.
export function FaqSection({ id, items, title = "よくある質問" }: { id: string; items: FaqItem[]; title?: string }) {
  if (!items.length) return null
  return <section aria-labelledby={`${id}-title`} className="space-y-3 min-w-0">
    <h2 id={`${id}-title`} className="font-bold text-lg">{title}</h2>
    <div className="divide-y divide-border/40 rounded-2xl border border-zinc-800/80 bg-zinc-900/40">
      {items.map(item => <details key={item.question} className="group px-4 py-3 sm:px-5">
        <summary className="cursor-pointer list-none font-bold text-sm text-zinc-200 flex items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 break-words">{item.question}</span>
          <span aria-hidden="true" className="shrink-0 text-muted-foreground group-open:rotate-45">＋</span>
        </summary>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground break-words">{item.answer}</p>
        {item.links?.length ? <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold">{item.links.map(link => <Link key={link.href} prefetch={false} href={link.href} className="text-primary hover:underline">{link.label}</Link>)}</p> : null}
      </details>)}
    </div>
  </section>
}
