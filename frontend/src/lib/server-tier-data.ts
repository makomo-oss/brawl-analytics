import { cache } from "react"
import { API_URL } from "./config"
import { isTierListData, type TierListData } from "./tier-data"

// Static export runs this on each build. A failed fetch must not publish an
// empty/loading-only page over the last successful production deployment.
export const getInitialTierData = cache(async (type: "global" | "gachi"): Promise<TierListData> => {
  const url = new URL("/meta/tier-list", API_URL)
  url.searchParams.set("type", type)
  if (type === "gachi") url.searchParams.set("rank_tier", "all")

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(45000) })
      if (!response.ok) throw new Error(`Tier API returned HTTP ${response.status}`)
      const data: unknown = await response.json()
      if (!isTierListData(data)) throw new Error("Tier API returned invalid data")
      return data
    } catch {
      if (attempt === 2) throw new Error(`Cannot prerender ${type} Tier data; the existing deployment should be retained`)
    }
  }
  throw new Error("Unreachable Tier fetch state")
})
