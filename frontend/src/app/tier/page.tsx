import TierListPage from "./tier-view"
import { getInitialTierData } from "@/lib/server-tier-data"
import { getInitialMatchups } from "@/lib/server-brawler-pages"
import { pageMetadata } from "@/lib/seo"
import { tierCopy } from "@/lib/page-copy"

export async function generateMetadata() {
  const [global, gachi] = await Promise.all([getInitialTierData("global"), getInitialTierData("gachi")])
  const copy = tierCopy(global, Date.now(), gachi)
  return pageMetadata(copy.title, copy.description, "/tier")
}

export default async function Page() {
  const [initialTierData, initialGachiTierData, initialMatchups] = await Promise.all([
    getInitialTierData("global"),
    getInitialTierData("gachi"),
    getInitialMatchups(),
  ])
  return <TierListPage initialTierData={initialTierData} initialGachiTierData={initialGachiTierData} initialMatchups={initialMatchups} />
}
