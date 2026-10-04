import { getBrawlerInfo, getBrawlerRarity } from "./brawlers"

export const playerBrawlerSorts = {
  trophies: "トロフィーが多い順",
  name: "名前（あいうえお順）",
  power: "パワーレベルが高い順",
  rarity: "レア度が高い順",
} as const
export type PlayerBrawlerSort = keyof typeof playerBrawlerSorts

interface OwnedBrawler { id: number; name: string; power?: number; trophies?: number }

export function sortPlayerBrawlers<T extends OwnedBrawler>(brawlers: readonly T[], sort: PlayerBrawlerSort): T[] {
  const nameOrder = (a: T, b: T) => getBrawlerInfo(a.name).nameJa.localeCompare(getBrawlerInfo(b.name).nameJa, "ja") || a.id - b.id
  const rarityRank = (brawler: T) => {
    const id = getBrawlerRarity(brawler.name)?.id || 0
    // Unrecognized tiers stay after the known rarity tiers.
    return id >= 1 && id <= 7 ? id : 0
  }
  return [...brawlers].sort((a, b) => {
    if (sort === "name") return nameOrder(a, b)
    if (sort === "power") return (b.power || 1) - (a.power || 1) || nameOrder(a, b)
    if (sort === "rarity") return rarityRank(b) - rarityRank(a) || nameOrder(a, b)
    return (b.trophies || 0) - (a.trophies || 0) || nameOrder(a, b)
  })
}
