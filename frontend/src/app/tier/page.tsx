import TierListPage from "./tier-view"
import { getInitialTierData } from "@/lib/server-tier-data"
import { getInitialMatchups } from "@/lib/server-brawler-pages"
import { pageMetadata } from "@/lib/seo"
import { tierCopy } from "@/lib/page-copy"

export async function generateMetadata() {
  const copy = tierCopy(await getInitialTierData("global"), Date.now())
  return pageMetadata(copy.title, copy.description, "/tier")
}

export default async function Page() {
  const initialTierData = await getInitialTierData("global")
  return <TierListPage initialTierData={initialTierData} initialMatchups={await getInitialMatchups()} />
}
