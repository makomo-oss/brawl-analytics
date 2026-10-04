import CockpitHomePage from "./home-view"
import { getInitialTierData } from "@/lib/server-tier-data"
import { getBrawlerEntries } from "@/lib/server-brawler-pages"

export default async function Page() {
  const initialTierData = await getInitialTierData("gachi")
  const entries = await getBrawlerEntries()
  return <CockpitHomePage initialTierData={initialTierData} detailSlugs={entries.map(entry => entry.slug)} />
}
