import TierListPage from "./tier-view"
import { getInitialTierData } from "@/lib/server-tier-data"
import { getBrawlerEntries } from "@/lib/server-brawler-pages"

export default async function Page() {
  const initialTierData = await getInitialTierData("global")
  const entries = await getBrawlerEntries()
  return <TierListPage initialTierData={initialTierData} detailSlugs={entries.map(entry => entry.slug)} />
}
