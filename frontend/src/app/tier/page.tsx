import TierListPage from "./tier-view"
import { getInitialTierData } from "@/lib/server-tier-data"
import { getInitialMatchups } from "@/lib/server-brawler-pages"

export default async function Page() {
  const initialTierData = await getInitialTierData("global")
  return <TierListPage initialTierData={initialTierData} initialMatchups={await getInitialMatchups()} />
}
