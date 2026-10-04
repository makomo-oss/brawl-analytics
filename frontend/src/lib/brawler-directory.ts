import type { brawlerEntries, Cohort } from "./brawler-page-data"

export const directorySorts = {
  english: "名前（英語順）",
  japanese: "名前（あいうえお順）",
  win_rate: "勝率が高い順",
  use_rate: "使用率が高い順",
  total_matches: "集計件数が多い順",
} as const
export type DirectorySort = keyof typeof directorySorts
export type DirectoryEntry = ReturnType<typeof brawlerEntries>[number]

export function normalizeBrawlerSearch(value: string) {
  return value.normalize("NFKC").toLowerCase()
    .replace(/[\u30a1-\u30f6]/g, char => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .replace(/[\s_.&・-]/g, "")
}

export function filterAndSortBrawlers(entries: readonly DirectoryEntry[], query: string, sort: DirectorySort, cohort: Cohort) {
  const search = normalizeBrawlerSearch(query)
  const filtered = entries.filter(entry => [entry.nameJa, entry.name, entry.slug].some(name => normalizeBrawlerSearch(name).includes(search)))
  const nameOrder = (a: DirectoryEntry, b: DirectoryEntry) => a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0
  return filtered.sort((a, b) => {
    if (sort === "english") return nameOrder(a, b)
    if (sort === "japanese") return a.nameJa.localeCompare(b.nameJa, "ja") || nameOrder(a, b)
    const left = a.directoryStats[cohort], right = b.directoryStats[cohort]
    if (!left || !right) return Number(!!right) - Number(!!left) || nameOrder(a, b)
    // Small, lucky samples must not lead the win-rate ranking.
    if (sort === "win_rate" && left.sample_sufficient !== right.sample_sufficient) return Number(right.sample_sufficient) - Number(left.sample_sufficient)
    return right[sort] - left[sort] || nameOrder(a, b)
  })
}
