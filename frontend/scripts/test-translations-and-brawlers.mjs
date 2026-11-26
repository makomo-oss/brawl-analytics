import assert from "node:assert/strict"
import { build } from "esbuild"

const output = await build({
  stdin: {
    contents: 'export * from "./src/lib/brawlers"; export * from "./src/lib/translations"',
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
})
const { getBrawlerInfo, getBrawlerRarity, translateMode, translateMap, getModeIconUrl } = await import(
  `data:text/javascript;base64,${Buffer.from(output.outputFiles[0].contents).toString("base64")}`
)

for (const name of ["thunder frogs", "Thunder Frogs", "THUNDER FROGS"]) {
  const info = getBrawlerInfo(name)
  assert.equal(info.nameJa, "サンダーフロッグ")
  assert.equal(info.imageUrl, "https://cdn.brawlify.com/brawlers/borders/16000111.png")
  assert.deepEqual(getBrawlerRarity(name), { id: 6, name: "Legendary" })
}

const addedModes = [
  "bombHeist",
  "deathmatch",
  "deathmatch5v5",
  "gunGame",
  "hunterSurvivor",
  "killConfirmed",
  "loadedShowdown",
  "loadedDuoShowdown",
  "megaShowdown",
  "megaDuoShowdown",
  "treasureHunt",
]
for (const mode of addedModes) {
  const ja = translateMode(mode)
  assert.notEqual(ja, mode, `Expected mode ${mode} to be translated`)
  assert.ok(ja.length > 0)
  const icon = getModeIconUrl(mode, false)
  assert.match(icon, /^https:\/\/cdn\.brawlify\.com\/game-modes\/regular\/\d+\.png$/, `Expected valid icon URL for ${mode}`)
}

const addedMaps = [
  "Alchemy",
  "gachi_Alchemy",
  "Barrel Bluff",
  "Big Battle Basin",
  "Brawl Starrgate",
  "Brawler's Rift",
  "Brawlerverse",
  "Dungeon Train",
  "Eye of the Storm",
  "Ghost Point",
  "Hee Hee",
  "Hide Tide",
  "Hideout Havoc",
  "Hot Maze",
  "In Demand",
  "Island Of Finality",
  "Mirages of Madness",
  "Net Presence",
  "Nothing Suspicious",
  "Paperback Pond",
  "Peekproof",
  "Pump It Up",
  "Quick Travel",
  "Sapphire Plains",
  "Scorched Stone",
  "Seekret Passage",
  "Shadow Spirits",
  "Square Off",
  "Starr Fish",
  "Stroke of Luck",
  "Temple of Boom",
  "Time Flies",
  "Tread Carefully",
  "Triple Threat",
  "Unhappy Arena",
  "Ravenous Rapids",
  "Don't Leaf Me",
  "Dry Run",
  "Emotional Detachment",
  "Endothermic Shift",
  "Eye of the Beholder",
  "Fires Across",
  "Framework",
  "Front Tackle",
  "Human Nature",
  "On the Lookout",
  "Passing Through",
  "Patchwork Peril",
  "Pincer Movement",
  "Printstream",
  "Quadrant Clash",
  "Roundabout Rumble",
  "Sectioned",
  "Sound Waves",
  "Sudden Movements",
  "Sunken harbor",
]
for (const map of addedMaps) {
  const raw = map.replace(/^gachi_/, "")
  const ja = translateMap(map)
  assert.notEqual(ja, raw, `Expected map ${map} to be translated`)
  assert.ok(ja.length > 0)
}
assert.equal(translateMap("unknown"), "不明")

console.log(`PASS: Thunder Frogs, ${addedModes.length} modes, and ${addedMaps.length} maps verified`)
