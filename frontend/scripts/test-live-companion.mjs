import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { build } from "esbuild"
import { fileURLToPath } from "node:url"

const bundle = await build({ entryPoints: ["edge/worker.ts"], bundle: true, format: "esm", platform: "browser", jsx: "automatic", tsconfig: "tsconfig.json", write: false,
  alias: Object.fromEntries(["link", "image", "navigation"].map(name => [`next/${name}`, fileURLToPath(new URL(`../edge/${name}.tsx`, import.meta.url))])), define: { "process.env.NODE_ENV": '"production"' } })
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`)
const snapshot = JSON.parse(await readFile("out/__companion-snapshots/index.json", "utf8"))
const original = { fetch: globalThis.fetch, caches: globalThis.caches, now: Date.now }
const storage = new Map(), pending = []
let now = Date.now(), offline = false, invalid = false, documents = true, assets = true, held = null
let categories = structuredClone(snapshot.categories)
Date.now = () => now
globalThis.caches = { open: async () => ({ match: async key => storage.get(key.url)?.clone(), put: async (key, response) => storage.set(key.url, response.clone()) }) }
globalThis.fetch = async input => {
  assert.equal(new URL(input).pathname, "/meta/categories", "Draft HTML must not load expensive matchup matrices")
  if (held) await held
  if (offline) return new Response("unavailable", { status: 503 })
  return Response.json(invalid ? { modes: [], maps: [], mode_to_maps: {} } : categories)
}
const env = { NEXT_PUBLIC_API_URL: "https://statistics.example", ASSETS: { fetch: async request => {
  const path = new URL(request.url).pathname
  if (assets && (documents || !path.endsWith(".document"))) {
    try { return new Response(await readFile(`out${path}`)) } catch {}
  }
  return new Response("missing", { status: 404 })
} } }
const ctx = { waitUntil: promise => pending.push(promise) }
const request = (path = "/companion", method = "GET") => worker.fetch(new Request(`https://example.com${path}`, { method }), env, ctx)
const drain = async () => { await Promise.all(pending.splice(0)) }
const payload = html => JSON.parse(html.match(/<script id="brawler-page-data" type="application\/json">([^<]+)<\/script>/)[1])
try {
  let release
  held = new Promise(resolve => { release = resolve })
  const response = await Promise.race([request("/companion?tag=PRIVATE"), new Promise((_, reject) => setTimeout(() => reject(new Error("Cold draft waited for API")), 1000))])
  assert.equal(response.status, 200)
  assert.equal(response.headers.get("X-Brawler-Rendering"), "snapshot")
  const cold = await response.text()
  assert.deepEqual(payload(cold).categories, snapshot.categories)
  assert.match(cold, /aria-labelledby="draft-mode-label"/)
  assert.doesNotMatch(cold, /PRIVATE|self\.__next_f|モードを選択|マップを選択/)
  for (const path of ["/modes", "/maps"]) assert(cold.includes(`href="${path}"`))
  assert.match(cold, /name="robots" content="index, follow"/)
  assert.match(cold, /rel="canonical" href="https:\/\/brawl-lab.sozai-hub.com\/companion"/)
  release(); held = null; await drain()
  assert.equal((await request()).headers.get("X-Brawler-Rendering"), "live")
  // New real choices appear without a deployment; all associations must agree.
  categories = { modes: ["brawlBall"], maps: ["Future Arena"], mode_to_maps: { brawlBall: ["Future Arena"] } }
  now += 301_000
  await request(); await drain()
  const healthy = await (await request()).text()
  assert(healthy.includes("Future Arena"))
  for (const failure of ["empty", "offline", "inconsistent"]) {
    now += 301_000; invalid = failure === "empty"; offline = failure === "offline"
    if (failure === "inconsistent") categories = { modes: ["brawlBall"], maps: ["Another Arena"], mode_to_maps: { brawlBall: ["Missing Arena"] } }
    await request(); await drain()
    assert.equal(await (await request()).text(), healthy, "Failed refresh must retain usable HTML and choices")
    await drain()
  }
  assert.equal(await (await request("/companion", "HEAD")).text(), "")
  assert.equal((await request("/companion/")).status, 308)
  assert.equal((await request("/companion", "POST")).status, 405)
  documents = false; storage.clear(); offline = true
  assert.equal((await request()).status, 200, "JSON build fallback survives an API outage")
  await drain()
  assets = false; storage.clear()
  assert.equal((await request()).status, 503, "Never serve an empty 200 without any healthy data")
  console.log("PASS: draft populated cold HTML, no-rebuild update, outage/empty/malformed retention, JSON fallback, canonical, links and HEAD/308/405/503")
} finally {
  held = null; await drain()
  globalThis.fetch = original.fetch; globalThis.caches = original.caches; Date.now = original.now
}
process.exit(0)
