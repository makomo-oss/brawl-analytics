import assert from "node:assert/strict"
import { build } from "esbuild"
const output = await build({ entryPoints: ["src/lib/public-stats-cache.ts"], bundle: true, format: "esm", write: false })
const { fetchPublicStats } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].contents).toString("base64")}`)
const originalFetch = globalThis.fetch, originalNow = Date.now
let calls = 0, fail = false, now = originalNow()
Date.now = () => now
globalThis.fetch = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 5)); return fail ? new Response("error", { status: 503 }) : Response.json({ characters: { amber: { score: 60 } } }) }
const url = "https://example.com/meta/tier-list?type=gachi&rank_tier=all"
try {
  const [a, b] = await Promise.all([fetchPublicStats(url), fetchPublicStats("https://example.com/meta/tier-list?rank_tier=all&type=gachi")])
  assert.equal(calls, 1)
  a.characters.amber.score = 0
  assert.equal(b.characters.amber.score, 60)
  assert.equal((await fetchPublicStats(url)).characters.amber.score, 60)
  assert.equal(calls, 1)
  now += 300_001
  await fetchPublicStats(url)
  assert.equal(calls, 2)
  fail = true
  const errorUrl = "https://example.com/meta/categories?type=gachi"
  await assert.rejects(fetchPublicStats(errorUrl))
  fail = false
  await fetchPublicStats(errorUrl)
  assert.equal(calls, 4)
  await assert.rejects(fetchPublicStats("https://example.com/player/search?q=example"))
  assert.equal(calls, 4)
  console.log("PASS: concurrent requests and query order deduplicated, TTL refresh, failed request retries, isolated copies and player URLs excluded")
} finally { globalThis.fetch = originalFetch; Date.now = originalNow }
