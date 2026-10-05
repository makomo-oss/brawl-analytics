import assert from "node:assert/strict"
import { build } from "esbuild"

const output = await build({ entryPoints: ["src/lib/draft-data.ts"], bundle: true, format: "esm", write: false })
const { draftDataUrls, cachedDraftDetails, fetchDraftBase, fetchDraftDetails, prefetchDraftData } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].contents).toString("base64")}`)
const originalFetch = globalThis.fetch
const calls = new Map()
let releaseDetails
const detailGate = new Promise(resolve => { releaseDetails = resolve })
let failDetails = false
let emptyDetails = false
globalThis.fetch = async url => {
  const parsed = new URL(url)
  calls.set(url, (calls.get(url) ?? 0) + 1)
  if (parsed.searchParams.get("include_details") === "true") {
    await detailGate
    if (failDetails) return new Response("unavailable", { status: 503 })
    if (emptyDetails) return Response.json({ characters: {} })
    return Response.json({ characters: { amber: { score: 60, matchups: { shelly: 70 }, synergies: { emz: { lift: 3 } } } } })
  }
  if (parsed.searchParams.get("sub_type") === "mode") return Response.json({ characters: { amber: { score: 55 } } })
  return Response.json({ characters: { amber: { score: 60 } } })
}

try {
  const urls = draftDataUrls("https://example.com/api", "brawlBall", "Triple & Dribble")
  assert.equal(new URL(urls.base).searchParams.get("id"), "Triple & Dribble")
  assert.equal(new URL(urls.base).searchParams.get("mode"), "brawlBall")
  assert.equal(new URL(urls.details).searchParams.get("include_matchup_fallback"), "false")
  prefetchDraftData(urls)
  let detailResolved = false
  const pending = fetchDraftDetails(urls).then(data => { detailResolved = true; return data })
  const base = await fetchDraftBase(urls)
  assert.equal(base.characters.amber.score, 60)
  assert.equal(detailResolved, false, "BAN data resolves while the full pair request is still blocked")
  assert.equal(cachedDraftDetails(urls), undefined, "never mark incomplete Pick data ready")
  for (const count of calls.values()) assert.equal(count, 1, "prefetch and Start share each request")
  releaseDetails()
  const details = await pending
  assert.equal(details.characters.amber.mode_score, 55)
  assert.equal(details.characters.amber.matchups.shelly, 70)
  assert.equal(details.characters.amber.synergies.emz.lift, 3)
  details.characters.amber.matchups.shelly = 0
  assert.equal(cachedDraftDetails(urls).characters.amber.matchups.shelly, 70)
  assert.equal(base.characters.amber.mode_score, undefined, "base data is not overwritten")

  const other = draftDataUrls("https://example.com/api", "heist", "Different map")
  assert.equal(cachedDraftDetails(other), undefined, "map and mode contexts cannot mix")
  failDetails = true
  await assert.rejects(fetchDraftDetails(other), /503/)
  assert.equal(cachedDraftDetails(other), undefined)
  failDetails = false
  assert.equal((await fetchDraftDetails(other)).characters.amber.mode_score, 55)
  const empty = draftDataUrls("https://example.com/api", "knockout", "Empty map")
  emptyDetails = true
  await assert.rejects(fetchDraftDetails(empty), /データが不足/)
  assert.equal(cachedDraftDetails(empty), undefined, "empty detail response never enables Pick")
  console.log("PASS: independent BAN loading, shared prefetch requests, complete Pick data, encoded map/mode isolation, copy safety and retry after failure")
} finally { globalThis.fetch = originalFetch }
