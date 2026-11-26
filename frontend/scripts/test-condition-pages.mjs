import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { build } from "esbuild"
import { fileURLToPath } from "node:url"

const conditionBundle = await build({ entryPoints: ["src/lib/condition-pages.ts"], bundle: true, format: "esm", platform: "node", write: false })
const { conditionIndex, conditionPage, conditionSchema, mapSlug } = await import(`data:text/javascript;base64,${Buffer.from(conditionBundle.outputFiles[0].contents).toString("base64")}`)
const snapshot = JSON.parse(await readFile(".seo-data/brawler-pages.json", "utf8"))
const index = conditionIndex(snapshot)
const entries = [...index.modes, ...index.maps]
assert.equal(index.modes.length, 8)
assert.equal(new Set(entries.map(row => row.path)).size, entries.length)
assert.equal(mapSlug("gachi_Belle's Rock"), "belles-rock")
const tiny = structuredClone(snapshot)
for (const type of ["global", "gachi"]) for (const kind of ["modes", "maps"]) for (const rows of Object.values(tiny.contexts[type][kind])) for (const row of Object.values(rows)) row.sample_sufficient = false
assert.deepEqual(conditionIndex(tiny), { modes: [], maps: [] })
for (const entry of entries) {
  const page = conditionPage(snapshot, entry, index)
  assert(Object.values(page.cohorts).some(cohort => cohort.rows.some(row => row.sample_sufficient)))
  const schema = conditionSchema(page)
  const visible = page.cohorts.global.rows.length ? page.cohorts.global.rows : page.cohorts.gachi.rows
  assert.deepEqual(schema["@graph"][1].mainEntity.itemListElement.map(row => row.name), visible.map(row => row.nameJa))
  assert(page.related.every(row => entries.some(entry => entry.path === row.path)))
}
const bundle = await build({ entryPoints: ["edge/worker.ts"], bundle: true, format: "esm", platform: "browser", jsx: "automatic", tsconfig: "tsconfig.json", write: false,
  alias: Object.fromEntries(["link", "image", "navigation"].map(name => [`next/${name}`, fileURLToPath(new URL(`../edge/${name}.tsx`, import.meta.url))])), define: { "process.env.NODE_ENV": '"production"' } })
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`)
const original = { fetch: globalThis.fetch, caches: globalThis.caches, now: Date.now }
let fetchCount = 0
let now = 1_800_000_000_000, held = null, sufficient = true, offline = false
let inventoryOffline = false
const requestedPaths = []
Date.now = () => now
const cache = new Map(), pending = []
globalThis.caches = { open: async () => ({ match: async request => cache.get(request.url)?.clone(), put: async (request, response) => cache.set(request.url, response.clone()) }) }
const ctx = { waitUntil: promise => pending.push(promise) }
const env = { NEXT_PUBLIC_API_URL: "https://test-statistics.example", ASSETS: { fetch: async request => {
  const path = new URL(request.url).pathname
  // Simulate a stale export left by a previous deployment. This URL is absent
  // from the current build inventory and must be evaluated against live data.
  if (path === "/__rendered-pages/maps/future-arena.document") return new Response('<title>Retired export</title><meta name="robots" content="index, follow">')
  try { return new Response(await readFile(`out${path}`), { headers: { "Content-Type": path.endsWith(".json") ? "application/json" : "text/html" } }) }
  catch { return new Response("<h1>404</h1>", { status: 404 }) }
} } }
globalThis.fetch = async input => {
  fetchCount++
  if (held) await held
  if (offline) return new Response("offline", { status: 503 })
  const url = new URL(input), type = url.searchParams.get("type") || "global"
  requestedPaths.push(url.pathname)
  if (url.pathname === "/meta/brawlers") return Response.json({ brawlers: snapshot.catalog })
  if (url.pathname === "/meta/categories") {
    if (inventoryOffline) return new Response("inventory unavailable", { status: 503 })
    const mode_to_maps = Object.fromEntries(index.modes.filter(row => row.ids[type]).map(row => [row.ids[type], []]))
    for (const [id, modes] of Object.entries(snapshot.mapModes[type])) for (const mode of modes) if (mode_to_maps[mode]) mode_to_maps[mode].push(id)
    ;(mode_to_maps.brawlBall ||= []).push("Future Arena")
    return Response.json({ mode_to_maps })
  }
  if (url.pathname === "/meta/tier-list") {
    const kind = url.searchParams.get("sub_type") === "mode" ? "modes" : "maps", id = url.searchParams.get("id")
    const characters = id === "Future Arena" ? { amber: { ...snapshot.overview[type].characters.amber, sample_sufficient: sufficient } } : (snapshot.contexts[type][kind][id] || {})
    return Response.json({ tiers: { A: Object.keys(characters) }, characters, updated_at: "2026-10-05T12:00:00Z", metrics: { analyzed_matches: 1000 } })
  }
  return Response.json({ ...snapshot, details: { global: {}, gachi: {} }, contexts: { global: { modes: {}, maps: {} }, gachi: { modes: {}, maps: {} } } })
}
const request = (path, method = "GET") => worker.fetch(new Request(`https://example.com${path}`, { method }), env, ctx)
const drain = async () => { await Promise.all(pending.splice(0)) }
try {
  let release
  held = new Promise(resolve => { release = resolve })
  const cold = await Promise.race([request("/modes/brawl-ball"), new Promise((_, reject) => setTimeout(() => reject(new Error("Cold page waited for API")), 150))])
  assert.equal(cold.status, 200)
  assert.equal(cold.headers.get("X-Brawler-Rendering"), "snapshot")
  const html = await cold.text()
  assert.match(html, /href="\/brawlers\/amber"/)
  assert.match(html, /id="global-panel"/); assert.match(html, /id="gachi-panel"/)
  assert.match(html, /CollectionPage/); assert.match(html, /ItemList/)
  assert.match(html, /rel="canonical" href="https:\/\/brawl-lab.sozai-hub.com\/modes\/brawl-ball"/)
  assert.doesNotMatch(html, /self\.__next_f/)
  release(); held = null; await drain()
  assert.equal((await request("/modes/brawl-ball")).headers.get("X-Brawler-Rendering"), "live")
  assert.match(await (await request("/modes/brawl-ball")).text(), /2026-10-05T12:00:00.000Z/)
  // Scope pages must keep refreshing even when an unrelated inventory scan is
  // unavailable; they need only index/catalog and their two selected scopes.
  inventoryOffline = true; now += 301_000
  const beforeRequests = requestedPaths.length
  await request("/modes/brawl-ball"); await drain()
  assert.equal((await request("/modes/brawl-ball")).headers.get("X-Brawler-Rendering"), "live")
  assert(!requestedPaths.slice(beforeRequests).includes("/meta/categories"))
  assert(requestedPaths.length - beforeRequests <= 4, "A detail refresh must not scan unrelated scopes")
  inventoryOffline = false
  for (const path of ["/modes", "/maps", index.maps[0].path]) assert.equal((await request(path)).status, 200)
  const mapsHubHtml = await (await request("/maps")).text()
  assert.match(mapsHubHtml, /aria-label="モードフィルター"/)
  assert.match(mapsHubHtml, /https:\/\/cdn\.brawlify\.com\/maps\/regular\/\d+\.png/)
  await drain()
  const sitemap = await (await request("/sitemap.xml")).text()
  for (const entry of entries) assert(sitemap.includes(entry.path), `Missing sitemap entry ${entry.path}`)
  await drain()
  // Visit/refresh the hub until the complete bounded inventory is published.
  for (let attempt = 0; attempt < 40; attempt++) {
    const before = fetchCount
    const html = await (await request("/maps")).text()
    await drain()
    assert(fetchCount - before <= 24, "Inventory refresh must stay bounded per visit")
    if (html.includes('href="/maps/future-arena"')) break
    now += 301_000; await drain()
  }
  assert.match(await (await request("/maps")).text(), /href="\/maps\/future-arena"/)
  sufficient = false
  now += 301_000
  for (let attempt = 0; attempt < 40; attempt++) {
    await request("/maps"); await drain()
    if (!(await (await request("/maps")).text()).includes('href="/maps/future-arena"')) break
    now += 301_000
  }
  await request("/sitemap.xml"); await drain()
  const currentSitemap = await (await request("/sitemap.xml")).text()
  const currentMaps = await (await request("/maps")).text()
  assert.doesNotMatch(currentSitemap, /<loc>[^<]*\/maps\/future-arena<\/loc>/)
  assert.doesNotMatch(currentMaps, /href="\/maps\/future-arena"/)
  const future = await request("/maps/future-arena")
  assert.equal(future.status, 200)
  assert.match(await future.text(), /name="robots" content="noindex, follow"/)
  assert.equal((await request("/maps/missing-map")).status, 404)
  assert.equal((await request("/modes/not-a-mode")).status, 404)
  assert.equal((await request("/modes/brawl-ball/")).status, 308)
  assert.equal(await (await request("/modes/brawl-ball", "HEAD")).text(), "")
  assert.equal((await request("/modes/brawl-ball", "POST")).status, 405)
  now += 301_000; offline = true
  assert.equal((await request("/modes/brawl-ball")).status, 200)
  await drain()
  console.log(`PASS: ${index.modes.length} modes / ${index.maps.length} maps; canonical URLs, cohort separation, real HTML, structured lists, sample gates, sitemap, cold/stale speed, live updates, new-map URLs, 404/HEAD/308/405`)
} finally {
  held = null; await drain()
  globalThis.fetch = original.fetch; globalThis.caches = original.caches; Date.now = original.now
}
process.exit(0)
