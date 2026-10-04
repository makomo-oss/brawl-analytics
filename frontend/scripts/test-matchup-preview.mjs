import assert from "node:assert/strict"
import { build } from "esbuild"
const output = await build({ entryPoints: ["src/lib/matchup-preview.ts"], bundle: true, format: "esm", write: false })
const { initialMatchup, characterDetailUrl } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].contents).toString("base64")}`)
const global = { kamo: [{brawler:"colt",win_rate:70,matches:100}], tenteki: [] }
const gachi = { kamo: [], tenteki: [{brawler:"edgar",win_rate:30,matches:50}] }
const data = { global: {amber:global}, gachi: {amber:gachi} }
assert.equal(initialMatchup(data,"amber","global"),global)
assert.equal(initialMatchup(data,"amber","gachi"),gachi)
for (const [rank,kind,id] of [["legendary","all",""],["all","mode","brawlBall"],["all","map","Crystal Arcade"]]) {
  assert.equal(initialMatchup(data,"amber","gachi",rank,kind,id),undefined,"filtered statistics must not use overall TOP5")
}
assert.equal(initialMatchup(data,"future hero","gachi"),undefined)
const url = new URL(characterDetailUrl("https://example.com", "R-T", "gachi", "legendary", "map", "Crystal Arcade"))
assert.equal(url.pathname,"/meta/characters/R-T")
assert.equal(url.searchParams.get("rank_tier"),"legendary")
assert.equal(url.searchParams.get("id"),"Crystal Arcade")
assert.equal(new URL(characterDetailUrl("http://localhost:3100/api", "amber")).pathname,"/api/meta/characters/amber")
console.log("PASS: initial TOP5 matches its cohort, filtered/new characters require their own data, detail URLs preserve conditions and proxy prefix")
