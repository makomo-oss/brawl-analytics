import assert from "node:assert/strict"
import { build } from "esbuild"
import { readFile } from "node:fs/promises"

const output = await build({ stdin: { contents: 'export * from "./src/lib/brawler-directory"; export { brawlerEntries } from "./src/lib/brawler-page-data"', resolveDir: process.cwd() }, bundle: true, format: "esm", platform: "node", write: false })
const { filterAndSortBrawlers: select, normalizeBrawlerSearch: normalize, brawlerEntries } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].contents).toString("base64")}`)
const stats = (win_rate, use_rate, total_matches, sample_sufficient = true) => ({ win_rate, use_rate, total_matches, sample_sufficient })
const entry = (slug, name, nameJa, global, gachi) => ({ slug, name, nameJa, imageUrl: "", directoryStats: { global, gachi } })
const entries = [
  entry("amber", "AMBER", "アンバー", stats(55, 2, 1000), stats(80, 3, 800)),
  entry("8-bit", "8-BIT", "8ビット", stats(90, 1, 3, false), null),
  entry("mr-p", "MR. P", "ミスターP", stats(60, 4, 2000), stats(50, 1, 500)),
  entry("larry-lawrie", "LARRY & LAWRIE", "ラリー＆ローリー", null, stats(90, 2, 1500)),
  entry("new-hero", "NEW HERO", "新キャラ", stats(60, 4, 2000), stats(50, 1, 500)),
]
const original = structuredClone(entries)
const slugs = (query = "", sort = "english", cohort = "global") => select(entries, query, sort, cohort).map(entry => entry.slug)
assert.equal(normalize("ＡＭＢＥＲ"), "amber")
assert.deepEqual(slugs("あんばー"), ["amber"])
assert.deepEqual(slugs("ｱﾝﾊﾞｰ"), ["amber"])
assert.deepEqual(slugs(" 8bit "), ["8-bit"])
assert.deepEqual(slugs("ＭＲ Ｐ"), ["mr-p"])
assert.deepEqual(slugs("ラリー & ローリー"), ["larry-lawrie"])
assert.deepEqual(slugs("newhero"), ["new-hero"])
assert.deepEqual(slugs("not-a-character"), [])
assert.equal(slugs("　").length, entries.length)
assert.deepEqual(slugs("", "win_rate"), ["mr-p", "new-hero", "amber", "8-bit", "larry-lawrie"])
assert.deepEqual(slugs("", "win_rate", "gachi"), ["larry-lawrie", "amber", "mr-p", "new-hero", "8-bit"])
assert.deepEqual(slugs("", "use_rate"), ["mr-p", "new-hero", "amber", "8-bit", "larry-lawrie"])
assert.deepEqual(slugs("", "total_matches", "gachi"), ["larry-lawrie", "amber", "mr-p", "new-hero", "8-bit"])
assert.deepEqual(slugs("", "japanese"), ["8-bit", "amber", "mr-p", "larry-lawrie", "new-hero"])
assert.deepEqual(entries, original, "Search and sorting must not mutate the input")
const snapshot = JSON.parse(await readFile(".seo-data/brawler-pages.json", "utf8"))
const actual = brawlerEntries(snapshot)
assert.equal(select(actual, "", "english", "global").length, actual.length)
for (const row of actual) {
  for (const cohort of ["global", "gachi"]) {
    const source = snapshot.overview[cohort].characters[row.name]
    assert.deepEqual(row.directoryStats[cohort], source?.total_matches > 0 ? { win_rate: source.win_rate, use_rate: source.use_rate, total_matches: source.total_matches, sample_sufficient: source.sample_sufficient === true } : null)
  }
}
console.log(`PASS: Japanese/English/kana search, punctuation, new characters, empty results, all sorts, cohorts, sample gates and ${actual.length} live entries`)
