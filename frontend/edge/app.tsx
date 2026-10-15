import { MainNav } from "@/components/main-nav"
import BrawlerDetailView from "@/app/brawlers/brawler-detail-view"
import BrawlerDirectoryView from "@/app/brawlers/brawler-directory-view"
import { RuntimePathname } from "./navigation"
import { ConditionDirectoryView, ConditionDetailView } from "@/components/condition-pages"
import type { PublicPage } from "@/lib/llm-data"
import HomeView from "@/app/home-view"
import TierView from "@/app/tier/tier-view"
import type { TierListData } from "@/lib/tier-data"
import type { InitialMatchups } from "@/lib/matchup-preview"

export type OverviewPage = { kind: "home" | "tier"; path: "/" | "/tier"; tierData: TierListData; initialMatchups: InitialMatchups }
export type RuntimePage = PublicPage | OverviewPage

export function App({ page }: { page: RuntimePage }) {
  return <RuntimePathname.Provider value={page.path}>
    <MainNav />
    <main className="container mx-auto px-3 py-4 sm:p-6 lg:p-8 max-w-7xl pb-24 lg:pb-8">
      {page.kind === "home" ? <HomeView initialTierData={page.tierData} initialMatchups={page.initialMatchups} /> : page.kind === "tier" ? <TierView initialTierData={page.tierData} initialMatchups={page.initialMatchups} /> : page.kind === "detail" ? <BrawlerDetailView data={page.data} /> : page.kind === "directory" ? <BrawlerDirectoryView entries={page.entries} /> : page.kind === "condition" ? <ConditionDetailView data={page.data} /> : page.kind === "conditions" ? <ConditionDirectoryView index={page.index} kind={page.category} /> : null}
    </main>
  </RuntimePathname.Provider>
}
