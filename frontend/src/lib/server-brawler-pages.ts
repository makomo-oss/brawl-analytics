import { cache } from "react"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { brawlerEntries, brawlerPage, type BrawlerSnapshot } from "./brawler-page-data"
export type { Cohort, CharacterStats, ConditionRow, PairRow, CohortData, BrawlerPageData } from "./brawler-page-data"
const getSnapshot = cache(async (): Promise<BrawlerSnapshot> => JSON.parse(await readFile(join(process.cwd(), ".seo-data/brawler-pages.json"), "utf8")))
export const getBrawlerEntries = cache(async () => brawlerEntries(await getSnapshot()))
export const getBrawlerPage = cache(async (slug: string) => brawlerPage(await getSnapshot(), slug))
