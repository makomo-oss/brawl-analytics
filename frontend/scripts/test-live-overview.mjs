import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { build } from "esbuild"
import { fileURLToPath } from "node:url"

const bundle = await build({ entryPoints: ["edge/worker.ts"], bundle: true, format: "esm", platform: "browser", jsx: "automatic", tsconfig: "tsconfig.json", write: false,
  alias: Object.fromEntries(["link", "image", "navigation"].map(name => [`next/${name}`, fileURLToPath(new URL(`../edge/${name}.tsx`, import.meta.url))])), define: { "process.env.NODE_ENV": '"production"' } })
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`)
const snapshot = JSON.parse(await readFile(".seo-data/brawler-pages.json", "utf8"))
const original = { fetch: globalThis.fetch, caches: globalThis.caches, now: Date.now }
const storage = new Map(), pending = []
let now = 1_800_000_000_000, held = null, offline = false, empty = false, assets = true
// The existing aggregate API can omit the UTC suffix. Rendering must still
// agree between the Windows build, UTC edge runtime, and Japanese browser.
let updatedAt = "2026-10-16T00:00:00"
Date.now = () => now
globalThis.caches = { open: async () => ({
  match: async request => { const row = storage.get(request.url); return row && new Response(row.body.slice(0), { headers: row.headers }) },
  put: async (request, response) => storage.set(request.url, { body: await response.arrayBuffer(), headers: new Headers(response.headers) }),
}) }
globalThis.fetch = async input => {
  if (held) await held
  if (offline) return new Response("offline", { status: 503 })
  if (new URL(input).pathname === "/meta/brawlers") return Response.json({ brawlers: [
    ...snapshot.catalog,
    { id: 16999998, name: "Live Future Hero", nameJa: "ライブ新キャラ", imageUrl: "https://cdn.brawlify.com/brawlers/borders/16999998.png", rarity: { id: 6, name: "Legendary" } },
  ] })
  const data = structuredClone(snapshot)
  for (const type of ["global", "gachi"]) {
    data.details[type] = {}; data.contexts[type] = { modes: {}, maps: {} }
    data.overview[type].updated_at = updatedAt
    data.overview[type].metrics.analyzed_matches = 987654
    data.overview[type].characters["live future hero"] = { ...data.overview[type].characters.amber, score: 99.9, rank_position: 1, sample_sufficient: true }
    data.overview[type].tiers["S+"] = ["live future hero", ...(data.overview[type].tiers["S+"] || [])]
    if (empty) { data.overview[type].characters = {}; data.overview[type].tiers = {} }
  }
  return Response.json(data)
}
const env = { NEXT_PUBLIC_API_URL: "https://test-statistics.example", ASSETS: { fetch: async request => {
  try { if (assets) return new Response(await readFile(`out${new URL(request.url).pathname}`)) } catch {}
  return new Response("missing", { status: 404 })
} } }
const ctx = { waitUntil: promise => pending.push(promise) }
const request = (path, method = "GET") => worker.fetch(new Request(`https://example.com${path}`, { method }), env, ctx)
const drain = async () => { await Promise.all(pending.splice(0)) }
const pageData = html => JSON.parse(html.match(/<script id="brawler-page-data" type="application\/json">(.*?)<\/script>/s)[1])
try {
  for (const path of ["/player"]) {
    held = new Promise(() => {})
    const response = await Promise.race([request(`${path}?tag=TEST-QUERY`), new Promise((_, reject) => setTimeout(() => reject(new Error("Tool HTML waited for API")), 1000))])
    assert.equal(response.status, 200)
    const html = await response.text()
    assert.match(html, /id="brawler-runtime"/)
    assert.doesNotMatch(html, /self\.__next_f|TEST-QUERY/)
    assert(html.includes(`"kind":"${path.slice(1)}"`))
    assert(html.includes(`rel="canonical" href="https://brawl-lab.sozai-hub.com${path}"`))
    assert.equal(await (await request(path, "HEAD")).text(), "")
    assert.equal((await request(`${path}/`)).status, 308)
    assert.equal((await request(path, "POST")).status, 405)
    held = null
  }
  for (const path of ["/", "/tier"]) {
    let release
    held = new Promise(resolve => { release = resolve })
    const response = await Promise.race([request(path), new Promise((_, reject) => setTimeout(() => reject(new Error("Cold HTML waited for API")), 500))])
    assert.equal(response.status, 200)
    assert.equal(response.headers.get("X-Brawler-Rendering"), "snapshot")
    const html = await response.text()
    const previews = pageData(html).initialMatchups
    assert(Object.keys(previews.gachi).length > 0, "cold panels must have initial matchup data")
    if (path === "/tier") assert(Object.keys(previews.global).length > 0)
    assert.match(html, new RegExp(`rel="canonical" href="https://brawl-lab.sozai-hub.com${path}"`))
    assert.doesNotMatch(html, /self\.__next_f|localhost:8000/)
    const links = path === "/tier" ? ["/modes", "/maps", "/brawlers"] : ["/tier", "/player", "/companion", "/brawlers"]
    for (const href of links) assert(html.includes(`href="${href}"`))
    release(); held = null; await drain()
    const live = await (await request(path)).text()
    assert.deepEqual(pageData(live).initialMatchups, previews, "live refresh must preserve instant panel previews when the API index omits details")
    assert.equal(pageData(live).tierData.metrics.analyzed_matches, 987654, "previews must not replace fresh Tier statistics")
    assert(live.includes(updatedAt))
    assert(live.includes("ライブ新キャラ"), "live overview SSR must render newly added catalog brawlers without a rebuild")
    assert(live.includes("https://cdn.brawlify.com/brawlers/borders/16999998.png"))
    assert(Array.isArray(pageData(live).catalog) && pageData(live).catalog.some(row => row.nameJa === "ライブ新キャラ"))
    assert(live.includes('"dateModified":"2026-10-16T00:00:00.000Z"'))
    assert(live.includes('rel="alternate" type="text/plain" title="LLMs.txt" href="https://brawl-lab.sozai-hub.com/llms.txt"'))
    if (path === "/tier") {
      assert(live.includes('dateTime="2026-10-16T00:00:00.000Z"'))
      assert(live.includes("ガチバトル（エリート以上）Tier 上位5キャラ"))
      assert(live.includes("現環境のガチバトル（エリート以上）で最強のキャラは？"))
    }
    assert.equal((await request(path)).headers.get("X-Brawler-Rendering"), "live")
  }
  // The same Worker observes the new generation without a rebuild.
  now += 301_000; updatedAt = "2026-10-17T00:00:00Z"
  await request("/"); await request("/tier"); await drain()
  assert((await (await request("/tier")).text()).includes(updatedAt))
  const healthy = await (await request("/tier")).text()
  assert(Object.keys(pageData(healthy).initialMatchups.global).length > 0, "previews must survive subsequent generations")
  for (const failure of ["empty", "offline"]) {
    now += 301_000; empty = failure === "empty"; offline = failure === "offline"
    await request("/tier"); await drain()
    assert.equal(await (await request("/tier")).text(), healthy)
    await drain()
  }
  assert.equal(await (await request("/", "HEAD")).text(), "")
  assert.equal((await request("/tier/" )).status, 308)
  assert.equal((await request("/", "POST")).status, 405)
  assets = false; storage.clear()
  empty = offline = false
  const withoutSnapshot = await request("/tier")
  assert.equal(withoutSnapshot.status, 200, "missing previews must not break live Tier data")
  assert.deepEqual(pageData(await withoutSnapshot.text()).initialMatchups, { global: {}, gachi: {} })
  storage.clear(); offline = true
  assert.equal((await request("/tier")).status, 503)
  console.log("PASS: home/Tier cold HTML and instant previews survive live refresh, missing-preview fallback, no-rebuild refresh, outage and empty-data retention, canonical, links, HEAD/308/405/503")
} finally {
  held = null; await drain()
  globalThis.fetch = original.fetch; globalThis.caches = original.caches; Date.now = original.now
}
process.exit(0)
