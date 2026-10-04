import CockpitHomePage from "./home-view"
import { getInitialTierData } from "@/lib/server-tier-data"

export default async function Page() {
  const initialTierData = await getInitialTierData("gachi")
  return <CockpitHomePage initialTierData={initialTierData} />
}
