import assert from "node:assert/strict"
import { build } from "esbuild"

const output = await build({
  entryPoints: ["src/lib/maps.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
})
const { getMapImageUrl, registerMapCatalog, filterMapsByMode, countMapsByMode } = await import(
  `data:text/javascript;base64,${Buffer.from(output.outputFiles[0].contents).toString("base64")}`
)

// Bundled seed resolution (exact, gachi_ prefix, case-insensitive, punctuation-normalized, unknown)
assert.match(getMapImageUrl("Hard Rock Mine"), /^https:\/\/cdn\.brawlify\.com\/maps\/regular\/\d+\.png$/)
assert.equal(getMapImageUrl("gachi_Hard Rock Mine"), getMapImageUrl("Hard Rock Mine"))
assert.equal(getMapImageUrl("hard rock mine"), getMapImageUrl("Hard Rock Mine"))
assert.equal(getMapImageUrl("Belles Rock"), getMapImageUrl("Belle's Rock"))
assert.match(getMapImageUrl("Alchemy"), /^https:\/\/cdn\.brawlify\.com\/maps\/regular\/\d+\.png$/)
assert.equal(getMapImageUrl("Definitely Nonexistent Map 999"), "")
assert.equal(getMapImageUrl(""), "")

// Live catalog registration & validation
assert.equal(registerMapCatalog({ maps: { "Live New Map": 15009991, __proto__: 9999, BadId: -1, BadStr: "123" } }), true)
assert.equal(getMapImageUrl("Live New Map"), "https://cdn.brawlify.com/maps/regular/15009991.png")
assert.equal(getMapImageUrl("gachi_live new map"), "https://cdn.brawlify.com/maps/regular/15009991.png")
assert.equal(getMapImageUrl("BadId"), "")
assert.equal(getMapImageUrl("BadStr"), "")
assert.equal(registerMapCatalog(null), false)
assert.equal(registerMapCatalog({ maps: {} }), false)

// Mode filtering and counting
const sampleEntries = [
  { kind: "maps", slug: "hard-rock-mine", label: "ごつごつ坑道", path: "/maps/hard-rock-mine", modeIds: ["gemGrab"], ids: { global: "Hard Rock Mine" }, updatedAt: null },
  { kind: "maps", slug: "center-stage", label: "中央コート", path: "/maps/center-stage", modeIds: ["brawlBall"], ids: { global: "Center Stage" }, updatedAt: null },
  { kind: "maps", slug: "cavern-churn", label: "激動の洞窟", path: "/maps/cavern-churn", modeIds: ["soloShowdown", "duoShowdown"], ids: { global: "Cavern Churn" }, updatedAt: null },
]
assert.deepEqual(countMapsByMode(sampleEntries), { gemGrab: 1, brawlBall: 1, soloShowdown: 1, duoShowdown: 1 })
assert.equal(filterMapsByMode(sampleEntries, "all").length, 3)
assert.deepEqual(filterMapsByMode(sampleEntries, "gemGrab").map(e => e.slug), ["hard-rock-mine"])
assert.deepEqual(filterMapsByMode(sampleEntries, "duoShowdown").map(e => e.slug), ["cavern-churn"])
assert.deepEqual(filterMapsByMode(sampleEntries, "heist"), [])

console.log("PASS: map image resolution, normalization, live registration, safety guards, and mode filtering verified")
