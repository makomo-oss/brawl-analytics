import { cache } from "react"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { brawlerEntries, brawlerPage, type BrawlerSnapshot } from "./brawler-page-data"
export type { Cohort, CharacterStats, ConditionRow, PairRow, CohortData, BrawlerPageData } from "./brawler-page-data"
const getSnapshot = cache(async (): Promise<BrawlerSnapshot> => JSON.parse(await readFile(join(process.cwd(), ".seo-data/brawler-pages.json"), "utf8")))
export const getBrawlerEntries = cache(async () => brawlerEntries(await getSnapshot()))
export const getBrawlerPage = cache(async (slug: string) => brawlerPage(await getSnapshot(), slug))
// Only the displayed TOP5 rows, not the full matchup matrix or synergy data.
export const getInitialMatchups = cache(async () => {
  const snapshot = await getSnapshot()
  const rows = (type: "global" | "gachi") => Object.fromEntries(Object.entries(snapshot.details[type]).map(([name, detail]) => [name, {
    kamo: detail.kamo.map(({ brawler, win_rate, matches }) => ({ brawler, win_rate, matches })),
    tenteki: detail.tenteki.map(({ brawler, win_rate, matches }) => ({ brawler, win_rate, matches })),
    kamo_scope: detail.kamo_scope, tenteki_scope: detail.tenteki_scope,
  }]))
  return { global: rows("global"), gachi: rows("gachi") }
})
