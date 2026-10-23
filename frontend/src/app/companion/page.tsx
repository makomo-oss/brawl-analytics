import DraftCompanionPage from "./companion-view"
import { getSnapshot } from "@/lib/server-brawler-pages"
import { draftCategoriesFromSnapshot } from "@/lib/draft-categories"

export default async function Page() {
  return <DraftCompanionPage initialCategories={draftCategoriesFromSnapshot(await getSnapshot())} />
}
