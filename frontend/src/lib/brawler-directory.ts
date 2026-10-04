import type { brawlerEntries, Cohort } from "./brawler-page-data"

export const directorySorts = {
  japanese: "名前（あいうえお順）",
  rarity: "レア度が高い順",
  win_rate: "勝率が高い順",
  use_rate: "使用率が高い順",
} as const
export type DirectorySort = keyof typeof directorySorts
export type DirectoryEntry = ReturnType<typeof brawlerEntries>[number]

const rarityNames: Record<number, string> = {
  1: "初期キャラ", 2: "レア", 3: "スーパーレア", 4: "ハイパーレア",
  5: "ウルトラレア", 6: "レジェンドレア", 7: "ウルトラレジェンドレア",
}
export function brawlerRarityLabel(entry: DirectoryEntry) {
  return entry.rarity ? rarityNames[entry.rarity.id] || entry.rarity.name : "レア度不明"
}

export function normalizeBrawlerSearch(value: string) {
  return value.normalize("NFKC").toLowerCase()
    .replace(/[\u30a1-\u30f6]/g, char => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .replace(/[\s_.&・-]/g, "")
}

export function filterAndSortBrawlers(entries: readonly DirectoryEntry[], query: string, sort: DirectorySort, cohort: Cohort) {
  const search = normalizeBrawlerSearch(query)
  const filtered = entries.filter(entry => [entry.nameJa, entry.name, entry.slug].some(name => normalizeBrawlerSearch(name).includes(search)))
  const nameOrder = (a: DirectoryEntry, b: DirectoryEntry) => a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0
  const japaneseOrder = (a: DirectoryEntry, b: DirectoryEntry) => a.nameJa.localeCompare(b.nameJa, "ja") || nameOrder(a, b)
  const rarityRank = (entry: DirectoryEntry) => entry.rarity && Object.hasOwn(rarityNames, entry.rarity.id) ? entry.rarity.id : 0
  return filtered.sort((a, b) => {
    if (sort === "japanese") return japaneseOrder(a, b)
    if (sort === "rarity") return rarityRank(b) - rarityRank(a) || japaneseOrder(a, b)
    const left = a.directoryStats[cohort], right = b.directoryStats[cohort]
    if (!left || !right) return Number(!!right) - Number(!!left) || nameOrder(a, b)
    // Small, lucky samples must not lead the win-rate ranking.
    if (sort === "win_rate" && left.sample_sufficient !== right.sample_sufficient) return Number(right.sample_sufficient) - Number(left.sample_sufficient)
    return right[sort] - left[sort] || nameOrder(a, b)
  })
}
