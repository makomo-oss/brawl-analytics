import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { build } from "esbuild"

const output = await build({ entryPoints: ["edge/route-loader.ts"], bundle: true, format: "esm", platform: "node", write: false })
const { createRouteLoader, isRuntimePath, isRuntimePage } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].contents).toString("base64")}`)
for (const path of ["/", "/player", "/tier", "/brawlers", "/companion", "/about", "/contact", "/brawlers/amber", "/maps/beach-ball", "/modes/brawl-ball"]) assert(isRuntimePath(path))
for (const path of ["https://other.example/tier", "/api/private", "/icon.svg", "/data/index.json", "/llms.txt", "/sitemap.xml", "/brawlers/../player", "/brawlers/a/b"]) assert(!isRuntimePath(path))
assert(!isRuntimePage({ kind: "player", path: "/tier" }, "/tier"))
assert(!isRuntimePage({ kind: "tier", path: "/tier", tierData: {} }, "/tier"))
assert(!isRuntimePage({ kind: "unknown", path: "/tier" }, "/tier"))
assert(isRuntimePage({ kind: "about", path: "/about" }, "/about"))
assert(!isRuntimePage({ kind: "about", path: "/player" }, "/player"))
assert(isRuntimePage({ kind: "contact", path: "/contact" }, "/contact"))
assert(!isRuntimePage({ kind: "contact", path: "/about" }, "/about"))
const fixture = JSON.parse(await readFile(".seo-data/brawler-pages.json", "utf8"))
const categories = JSON.parse(await readFile("out/__companion-snapshots/index.json", "utf8")).categories
assert(!isRuntimePage({ kind: "companion", path: "/companion" }, "/companion"), "Reject empty tool documents")
assert(isRuntimePage({ kind: "companion", path: "/companion", categories }, "/companion"))
assert(isRuntimePage({ kind: "tier", path: "/tier", tierData: fixture.overview.global, initialMatchups: {} }, "/tier"))

const html = page => `<!DOCTYPE html><script id="brawler-page-data" type="application/json">${JSON.stringify(page)}</script>`
let calls = 0, fail = false, release
const gate = new Promise(resolve => { release = resolve })
const loader = createRouteLoader(async path => {
  calls++
  await gate
  if (fail) return new Response("offline", { status: 503 })
  return new Response(html({ kind: path === "/player" ? "player" : "companion", path, ...(path === "/companion" ? { categories } : {}) }), { headers: { "Content-Type": "text/html; charset=utf-8" } })
})
await assert.rejects(loader.load("https://other.example/player"))
assert.equal(calls, 0, "Only supported local paths may be fetched")
const first = loader.load("/player"), second = loader.load("/player")
assert.equal(calls, 1, "Concurrent click and intent share one request")
release()
assert.deepEqual(await first, await second)
await loader.load("/player")
assert.equal(calls, 1, "A revisit reuses the completed document")
fail = true
await assert.rejects(loader.load("/companion"))
fail = false
assert.equal((await loader.load("/companion")).page.kind, "companion")
assert.equal(calls, 3, "Failures must remain retryable")

const originalNow = Date.now
try {
  let now = originalNow()
  Date.now = () => now
  await loader.load("/player")
  const previousCalls = calls
  now += 61_000
  await loader.load("/player")
  assert.equal(calls, previousCalls + 1, "Statistics documents expire rather than remaining stale for the session")
} finally { Date.now = originalNow }

for (const body of ["<h1>404</h1>", html({ kind: "companion", path: "/companion" }), html({ kind: "player", path: "/player" })]) {
  const invalid = createRouteLoader(async () => new Response(body, { headers: { "Content-Type": body.includes('"kind":"player"') ? "application/json" : "text/html" } }))
  await assert.rejects(invalid.load("/player"))
}
console.log("PASS: supported routes, payload validation, concurrent loading, repeat visits, cache expiry and failure recovery")
