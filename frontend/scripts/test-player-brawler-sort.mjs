import assert from "node:assert/strict"
import { build } from "esbuild"

const output = await build({ stdin: { contents: 'export * from "./src/lib/player-brawler-sort"; export { getBrawlerRarity } from "./src/lib/brawlers"; export { applyBrawlerCatalog } from "./src/lib/use-brawler-catalog"', resolveDir: process.cwd() }, bundle: true, format: "esm", platform: "node", write: false })
const { sortPlayerBrawlers: sort, playerBrawlerSorts, getBrawlerRarity, applyBrawlerCatalog } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].contents).toString("base64")}`)
const rows = [
  { id: 16000000, name: "SHELLY", power: 9, trophies: 500 },
  { id: 16000021, name: "GENE", power: 11, trophies: 700 },
  { id: 16000052, name: "MEG", power: 11, trophies: 200 },
  { id: 16000039, name: "COLETTE", power: 8, trophies: 400 },
  { id: 16000040, name: "AMBER", power: 11, trophies: 600 },
  { id: 999, name: "UNKNOWN HERO" },
]
const original = structuredClone(rows)
const names = (mode) => sort(rows, mode).map(row => row.name)
assert.deepEqual(Object.keys(playerBrawlerSorts), ["trophies", "name", "power", "rarity"])
assert.deepEqual(names("name"), ["UNKNOWN HERO", "AMBER", "COLETTE", "GENE", "SHELLY", "MEG"])
assert.deepEqual(names("power"), ["AMBER", "GENE", "MEG", "SHELLY", "COLETTE", "UNKNOWN HERO"])
assert.deepEqual(names("rarity"), ["AMBER", "MEG", "GENE", "COLETTE", "SHELLY", "UNKNOWN HERO"])
assert.deepEqual(names("trophies"), ["GENE", "AMBER", "SHELLY", "COLETTE", "MEG", "UNKNOWN HERO"])
assert.deepEqual(rows, original, "Sorting must not modify the player's cached data")
assert.deepEqual(sort([], "rarity"), [])
assert.equal(getBrawlerRarity(" AMBER ").id, 6, "Bundled rarity must work before the catalog request")

// Newly added characters and rarity-only updates must affect sorting without a build.
const imageUrl = "https://cdn.brawlify.com/brawlers/borders/16999999.png"
const newRow = { id: 16999999, name: "FUTURE HERO", nameJa: "未来キャラ", imageUrl, rarity: { id: 7, name: "Ultra Legendary" } }
assert.equal(applyBrawlerCatalog({ brawlers: [newRow] }), true)
const future = { id: newRow.id, name: newRow.name, power: 11, trophies: 0 }
assert.equal(sort([...rows, future], "rarity")[0].name, newRow.name)
applyBrawlerCatalog({ brawlers: [{ ...newRow, rarity: { id: 2, name: "Rare" } }] })
assert.equal(getBrawlerRarity(future.name).id, 2)
assert.ok(sort([...rows, future], "rarity").findIndex(row => row.id === future.id) > sort([...rows, future], "rarity").findIndex(row => row.name === "COLETTE"))
for (const rarity of [undefined, null, { id: 0, name: "Invalid" }, { id: 6, name: " " }, { id: "6", name: "Invalid" }]) {
  applyBrawlerCatalog({ brawlers: [{ ...newRow, rarity }] })
  assert.equal(getBrawlerRarity(future.name).id, 2, "Incomplete catalog data must retain the last known rarity")
}
applyBrawlerCatalog({ brawlers: [{ ...newRow, rarity: { id: 99, name: "Future tier" } }] })
assert.equal(sort([...rows, future], "rarity").at(-1).id, future.id, "Unrecognized tiers belong after known tiers")
console.log("PASS: owned character name/power/rarity/trophy sorting, ties, missing data, immutable source, bundled rarity and live catalog changes")
