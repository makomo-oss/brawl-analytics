import CockpitHomePage from "./home-view"
import { getInitialTierData } from "@/lib/server-tier-data"
import { getInitialMatchups } from "@/lib/server-brawler-pages"

export default async function Page() {
  const initialTierData = await getInitialTierData("gachi")
  const matchups = await getInitialMatchups()
  const names = [...(initialTierData.tiers["S+"] || []), ...(initialTierData.tiers.S || [])].slice(0, 12)
  const initialMatchups = { global: {}, gachi: Object.fromEntries(names.filter(name => matchups.gachi[name]).map(name => [name, matchups.gachi[name]])) }
  return <CockpitHomePage initialTierData={initialTierData} initialMatchups={initialMatchups} />
}
