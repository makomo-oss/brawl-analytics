import Link from "@/components/document-link"
import { FAN_CONTENT_NOTICE, SITE_SECTIONS } from "@/lib/site-sections"

// Rendered at the end of <main>, so main's existing bottom padding still
// clears the mobile bottom navigation. Reuses the home footer styling.
export function SiteFooter() {
  return <footer className="arena-home-footer arena-site-footer !mt-12 flex-col !items-start !gap-3">
    <span>ブロラボ <small>BRAWL LAB</small></span>
    <nav aria-label="サイト内リンク"><ul className="flex flex-wrap gap-x-4 gap-y-0.5 sm:gap-y-2 text-xs font-bold">
      {SITE_SECTIONS.map(section => <li key={section.path}><Link prefetch={false} href={section.path} className="inline-flex items-center min-h-10 sm:min-h-0 py-1 text-muted-foreground hover:text-primary">{section.label}</Link></li>)}
    </ul></nav>
    <p>非公式ファンツール · データ：Brawl Stars公式API · 画像：Brawlify</p>
    <p className="break-words">{FAN_CONTENT_NOTICE}</p>
  </footer>
}
