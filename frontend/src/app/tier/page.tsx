import TierListPage from "./tier-view"
import { getInitialTierData } from "@/lib/server-tier-data"

export default async function Page() {
  const initialTierData = await getInitialTierData("global")
  return <TierListPage initialTierData={initialTierData} />
}
