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
  if (new URL(input).pathname === "/meta/brawlers") return Response.json({ brawlers: snapshot.catalog })
  const data = structuredClone(snapshot)
  for (const type of ["global", "gachi"]) {
    data.details[type] = {}; data.contexts[type] = { modes: {}, maps: {} }
    data.overview[type].updated_at = updatedAt
    data.overview[type].metrics.analyzed_matches = 987654
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
try {
  for (const path of ["/", "/tier"]) {
    let release
    held = new Promise(resolve => { release = resolve })
    const response = await Promise.race([request(path), new Promise((_, reject) => setTimeout(() => reject(new Error("Cold HTML waited for API")), 500))])
    assert.equal(response.status, 200)
    assert.equal(response.headers.get("X-Brawler-Rendering"), "snapshot")
    const html = await response.text()
    assert.match(html, new RegExp(`rel="canonical" href="https://brawl-lab.sozai-hub.com${path}"`))
    assert.doesNotMatch(html, /self\.__next_f|localhost:8000/)
    for (const href of ["/modes", "/maps", "/brawlers"]) assert(html.includes(`href="${href}"`))
    release(); held = null; await drain()
    const live = await (await request(path)).text()
    assert(live.includes(updatedAt))
    assert(live.includes('dateTime="2026-10-16T00:00:00.000Z"'))
    assert.equal((await request(path)).headers.get("X-Brawler-Rendering"), "live")
  }
  // The same Worker observes the new generation without a rebuild.
  now += 301_000; updatedAt = "2026-10-17T00:00:00Z"
  await request("/"); await request("/tier"); await drain()
  assert((await (await request("/tier")).text()).includes(updatedAt))
  const healthy = await (await request("/tier")).text()
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
  assert.equal((await request("/tier")).status, 503)
  console.log("PASS: home/Tier cold HTML, no-rebuild refresh, outage and empty-data retention, canonical, links, HEAD/308/405/503")
} finally {
  held = null; await drain()
  globalThis.fetch = original.fetch; globalThis.caches = original.caches; Date.now = original.now
}
process.exit(0)
