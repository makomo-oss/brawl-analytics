import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { build } from "esbuild"
import { fileURLToPath } from "node:url"

// Compile the same entry as production once; every fixture mutation below is
// observed through API requests without rebuilding or recreating the Worker.
const output = await build({ entryPoints: ["edge/worker.ts"], bundle: true, minify: true, format: "esm", platform: "browser", jsx: "automatic", tsconfig: "tsconfig.json", write: false,
  alias: Object.fromEntries(["link", "image", "navigation"].map(name => [`next/${name}`, fileURLToPath(new URL(`../edge/${name}.tsx`, import.meta.url))])),
  define: { "process.env.NODE_ENV": '"production"' },
})
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].contents).toString("base64")}`)
const snapshot = JSON.parse(await readFile(".seo-data/brawler-pages.json", "utf8"))
let future = false, sufficient = true, offline = false, failures = 0, now = 1_800_000_000_000
const realNow = Date.now
Date.now = () => now
const originalFetch = globalThis.fetch
const originalCaches = globalThis.caches
const storage = new Map()
globalThis.caches = { open: async () => ({ match: async request => storage.get(request.url)?.clone(), put: async (request, response) => { storage.set(request.url, response.clone()) } }) }
const pending = []
const context = { waitUntil: promise => { pending.push(promise) } }
const env = { NEXT_PUBLIC_API_URL: "https://test-statistics.example", ASSETS: { fetch: async () => new Response("<h1>404</h1>", { status: 404, headers: { "Content-Type": "text/html" } }) } }
globalThis.fetch = async input => {
  if (offline) return new Response("offline", { status: 503 })
  if (failures > 0) { failures--; return new Response("transient failure", { status: 503 }) }
  const path = new URL(input).pathname
  if (path === "/meta/brawlers") return Response.json({ brawlers: [...snapshot.catalog, { name: "Future New Hero", nameJa: "新キャラ<テスト>", imageUrl: "", rarity: {id:7,name:"Ultra Legendary"} }] })
  const data = structuredClone(snapshot)
  if (future) {
    for (const cohort of ["global", "gachi"]) {
      data.overview[cohort].characters["future new hero"] = { ...data.overview[cohort].characters.amber, sample_sufficient: sufficient }
      data.overview[cohort].tiers.A.push("future new hero")
      data.details[cohort]["future new hero"] = data.details[cohort].amber
      for (const kind of ["modes", "maps"]) for (const rows of Object.values(data.contexts[cohort][kind])) if (rows.amber) rows["future new hero"] = rows.amber
    }
  }
  data.catalog = []
  for (const cohort of ["global", "gachi"]) {
    if (path === "/meta/brawler-pages") {
      data.details[cohort] = {}
      data.contexts[cohort] = { modes: {}, maps: {} }
    } else {
      data.details[cohort] = { "future new hero": data.details[cohort]["future new hero"] }
      for (const kind of ["modes", "maps"]) for (const [id, rows] of Object.entries(data.contexts[cohort][kind])) data.contexts[cohort][kind][id] = rows["future new hero"] ? { "future new hero": rows["future new hero"] } : {}
    }
  }
  return Response.json(data)
}
const request = path => worker.fetch(new Request(`https://example.com${path}`), env, context)
try {
  assert.equal((await request("/brawlers/future-new-hero")).status, 404)
  future = true
  failures = 1
  const response = await request("/brawlers/future-new-hero")
  assert.equal(response.status, 200)
  assert.equal(failures, 0)
  const html = await response.text()
  assert.match(html, /新キャラ&lt;テスト&gt;の勝率・相性/)
  assert.match(html, /id="global-panel"/)
  assert.match(html, /id="gachi-panel"/)
  assert.match(html, /rel="canonical" href="https:\/\/brawl-lab.sozai-hub.com\/brawlers\/future-new-hero"/)
  assert.match(html, /BreadcrumbList/)
  assert.match(html, /brawler-runtime-[a-f0-9]+\.js/)
  assert.doesNotMatch(html, /self\.__next_f/)
  const directoryHtml = await (await request("/brawlers")).text()
  assert.match(directoryHtml, /href="\/brawlers\/future-new-hero"/)
  assert.match(directoryHtml, /レア度が高い順/)
  assert.doesNotMatch(directoryHtml, /名前（英語順）|集計件数が多い順/)
  const directoryData = JSON.parse(directoryHtml.match(/id="brawler-page-data" type="application\/json">([^<]+)<\/script>/)[1])
  assert.deepEqual(directoryData.entries.find(row => row.slug === "future-new-hero").rarity, {id:7,name:"Ultra Legendary"})
  assert.match(await (await request("/sitemap.xml")).text(), /\/brawlers\/future-new-hero/)
  await Promise.all(pending.splice(0))
  now += 301_000
  sufficient = false
  assert.match(await (await request("/brawlers/future-new-hero")).text(), /name="robots" content="noindex, follow"/)
  assert.doesNotMatch(await (await request("/sitemap.xml")).text(), /\/brawlers\/future-new-hero/)
  await Promise.all(pending.splice(0))
  now += 301_000
  offline = true
  assert.equal((await request("/brawlers/future-new-hero")).status, 200)
  assert.equal((await request("/brawlers/uncached-hero")).status, 503)
  const head = await worker.fetch(new Request("https://example.com/brawlers/future-new-hero", { method: "HEAD" }), env, context)
  assert.equal(head.status, 200)
  assert.equal(await head.text(), "")
  assert.equal((await request("/brawlers/future-new-hero/")).status, 308)
  console.log("PASS: new URLs, directory, sitemap, initial HTML, metadata, sample gates, stale fallback, HEAD and canonical redirects without rebuilding")
} finally {
  Date.now = realNow
  globalThis.fetch = originalFetch
  globalThis.caches = originalCaches
  await Promise.all(pending)
}
// React's browser server renderer keeps its scheduler MessageChannel alive in
// Node. Assertions have completed; close this standalone test process.
process.exit(0)
