import { MainNav } from "@/components/main-nav"
import BrawlerDetailView from "@/app/brawlers/brawler-detail-view"
import BrawlerDirectoryView from "@/app/brawlers/brawler-directory-view"
import { RuntimePathname } from "./navigation"
import { ConditionDirectoryView, ConditionDetailView } from "@/components/condition-pages"
import type { PublicPage } from "@/lib/llm-data"

export type RuntimePage = PublicPage

export function App({ page }: { page: RuntimePage }) {
  return <RuntimePathname.Provider value={page.path}>
    <MainNav />
    <main className="container mx-auto px-3 py-4 sm:p-6 lg:p-8 max-w-7xl pb-24 lg:pb-8">
      {page.kind === "detail" ? <BrawlerDetailView data={page.data} /> : page.kind === "directory" ? <BrawlerDirectoryView entries={page.entries} /> : page.kind === "condition" ? <ConditionDetailView data={page.data} /> : <ConditionDirectoryView index={page.index} kind={page.category} />}
    </main>
  </RuntimePathname.Provider>
}
