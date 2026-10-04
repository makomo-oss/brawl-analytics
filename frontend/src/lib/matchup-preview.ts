export interface MatchupPreview {
  kamo: { brawler: string; win_rate: number; matches: number }[]
  tenteki: { brawler: string; win_rate: number; matches: number }[]
  kamo_scope?: string
  tenteki_scope?: string
}
export type InitialMatchups = Record<"global" | "gachi", Record<string, MatchupPreview>>

export function characterDetailUrl(api: string, name: string, type = "gachi", rank = "all", subType = "all", id = "") {
  const url = new URL(`${api}/meta/characters/${encodeURIComponent(name)}`)
  url.searchParams.set("type", type)
  if (type === "gachi") {
    url.searchParams.set("rank_tier", rank)
    if (subType !== "all" && id) {
      url.searchParams.set("sub_type", subType)
      url.searchParams.set("id", id)
    }
  }
  return url.href
}

export function initialMatchup(data: InitialMatchups, name: string, type: string, rank = "all", subType = "all", id = "") {
  // Never substitute an unfiltered snapshot for selected map/rank statistics.
  if (type === "global") return data.global[name]
  if (type === "gachi" && rank === "all" && (subType === "all" || !id)) return data.gachi[name]
  return undefined
}
