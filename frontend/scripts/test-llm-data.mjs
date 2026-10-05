import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { build } from "esbuild"
import { fileURLToPath } from "node:url"

const compile = async entry => {
  const output = await build({ entryPoints: [entry], bundle: true, format: "esm", platform: "browser", jsx: "automatic", tsconfig: "tsconfig.json", write: false,
    alias: Object.fromEntries(["link", "image", "navigation"].map(name => [`next/${name}`, fileURLToPath(new URL(`../edge/${name}.tsx`, import.meta.url))])), define: { "process.env.NODE_ENV": '"production"' } })
  return import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].contents).toString("base64")}`)
}
const { publicData, pageSchema, dataPath } = await compile("src/lib/llm-data.ts")
const { brawlerPage } = await compile("src/lib/brawler-page-data.ts")
const { conditionIndex, conditionPage, conditionSchema } = await compile("src/lib/condition-pages.ts")
const snapshot = JSON.parse(await readFile(".seo-data/brawler-pages.json", "utf8"))
const directory = conditionIndex(snapshot)
const characterPage = { kind: "detail", path: "/brawlers/amber", data: brawlerPage(snapshot, "amber") }
const character = publicData(characterPage)
const global = character.datasets.find(row => row.cohort.identifier === "global")
assert.equal(global.statistics.win_rate_percent, Number(characterPage.data.cohorts.global.stats.win_rate.toFixed(1)))
assert.equal(global.statistics.player_battle_records, characterPage.data.cohorts.global.stats.total_matches)
assert.equal(global.count_unit, "player_battle_records")
assert.equal(character.datasets.find(row => row.cohort.identifier === "gachi").cohort.minimum_rank, "elite")
assert.equal(global.matchups.scope, characterPage.data.cohorts.global.matchupScope)
assert.equal(global.recommended_maps.length, characterPage.data.cohorts.global.maps.length)
assert.doesNotMatch(JSON.stringify(character), /player_tag|gadgets|star_powers|synergy_matrix|raw_battle/)
for (const entry of [...directory.modes, ...directory.maps]) {
  const data = conditionPage(snapshot, entry, directory), page = { kind: "condition", path: entry.path, data }
  const exported = publicData(page), graph = pageSchema(page, conditionSchema(data), true)["@graph"]
  const datasets = graph.filter(node => node["@type"] === "Dataset")
  assert.deepEqual(datasets.map(node => node["@id"]), exported.datasets.map(node => node.id))
  for (const dataset of datasets) {
    assert(dataset.description.length >= 50)
    assert.match(dataset.includedInDataCatalog["@id"], /\/data\/catalog\.jsonld#catalog$/)
    assert.equal(dataset.distribution.contentUrl, `https://brawl-lab.sozai-hub.com${dataPath(entry.path)}`)
    assert.equal(dataset.variableMeasured.find(row => row.propertyID === "win_rate_percent").unitText, "%")
  }
  for (const dataset of exported.datasets) {
    const source = data.cohorts[dataset.cohort.identifier]
    assert.equal(dataset.updated_at, source.updatedAt)
    assert.equal(dataset.analysis_window_days, source.windowDays)
    assert.deepEqual(dataset.ranking.map(row => row.character.identifier), source.rows.map(row => row.name))
    assert(dataset.ranking.filter(row => !row.sample_sufficient).every(row => row.ranking_position === null))
  }
}
const { default: worker } = await compile("edge/worker.ts")
const original = { fetch: globalThis.fetch, caches: globalThis.caches, now: Date.now }
const storage = new Map(), pending = []
// Cache API stores independent bytes; keeping a chain of Node stream tees does
// not model its storage/consumption semantics reliably across repeated reads.
globalThis.caches = { open: async () => ({
  match: async request => { const row = storage.get(request.url); return row ? new Response(row.body.slice(0), { status: row.status, headers: row.headers }) : undefined },
  put: async (request, response) => { storage.set(request.url, { body: await response.arrayBuffer(), status: response.status, headers: new Headers(response.headers) }) },
}) }
const ctx = { waitUntil: promise => pending.push(promise) }
let now = 1_800_000_000_000, held = null, offline = false, future = false, sufficient = false
Date.now = () => now
const env = { NEXT_PUBLIC_API_URL: "https://test-statistics.example", ASSETS: { fetch: async request => {
  const path = new URL(request.url).pathname
  try { return new Response(await readFile(`out${path}`), { headers: { "Content-Type": path.endsWith(".json") ? "application/json" : "text/html" } }) }
  catch { return new Response("<h1>404</h1>", { status: 404 }) }
} } }
globalThis.fetch = async input => {
  if (held) await held
  if (offline) return new Response("offline", { status: 503 })
  const url = new URL(input), type = url.searchParams.get("type") || "global"
  if (url.pathname === "/meta/brawlers") return Response.json({ brawlers: [...snapshot.catalog, { name: "Future New Hero", nameJa: "新キャラ<テスト>", imageUrl: "" }] })
  const data = structuredClone(snapshot)
  for (const cohort of ["global", "gachi"]) {
    data.overview[cohort].updated_at = "2026-10-05T12:00:00Z"
    data.overview[cohort].characters.amber.win_rate = 68.765
    if (future) {
      data.overview[cohort].characters["future new hero"] = { ...data.overview[cohort].characters.amber, sample_sufficient: sufficient }
      data.overview[cohort].tiers.A.push("future new hero")
      data.details[cohort]["future new hero"] = data.details[cohort].amber
    }
  }
  if (url.pathname === "/meta/tier-list") {
    const kind = url.searchParams.get("sub_type") === "mode" ? "modes" : "maps", id = url.searchParams.get("id"), characters = data.contexts[type][kind][id]
    return Response.json({ tiers: { A: Object.keys(characters) }, characters, updated_at: "2026-10-05T12:00:00Z", metrics: { analyzed_matches: 1000 } })
  }
  if (url.pathname === "/meta/brawler-pages") for (const cohort of ["global", "gachi"]) { data.details[cohort] = {}; data.contexts[cohort] = { modes: {}, maps: {} } }
  else if (url.pathname.startsWith("/meta/brawler-pages/")) {
    const name = decodeURIComponent(url.pathname.split("/").pop())
    for (const cohort of ["global", "gachi"]) {
      data.details[cohort] = { [name]: data.details[cohort][name] }
      for (const kind of ["modes", "maps"]) for (const [id, rows] of Object.entries(data.contexts[cohort][kind])) data.contexts[cohort][kind][id] = rows[name] ? { [name]: rows[name] } : {}
    }
  }
  return Response.json(data)
}
const request = (path, method = "GET") => worker.fetch(new Request(`https://example.com${path}`, { method }), env, ctx)
const drain = async () => { await Promise.all(pending.splice(0)) }
try {
  let release
  held = new Promise(resolve => { release = resolve })
  const response = await Promise.race([request("/data/brawlers/amber.json"), new Promise((_, reject) => setTimeout(() => reject(new Error("JSON blocked on cold API")), 200))])
  assert.equal(response.status, 200)
  assert.match(response.headers.get("Content-Type"), /application\/json/)
  assert.match(response.headers.get("Link"), /\/brawlers\/amber>; rel="canonical"/)
  assert.deepEqual(await response.json(), character)
  const html = await (await request("/brawlers/amber")).text()
  assert.match(html, /rel="alternate" type="application\/json" href="https:\/\/brawl-lab.sozai-hub.com\/data\/brawlers\/amber.json"/)
  const graph = JSON.parse(html.match(/type="application\/ld\+json">([^<]+)<\/script>/)[1])["@graph"]
  assert.deepEqual(graph.filter(node => node["@type"] === "Dataset").map(node => node["@id"]), character.datasets.map(row => row.id))
  assert.equal(graph.find(node => node["@type"] === "Thing")["@id"], character.entity.id)
  release(); held = null; await drain()
  const fresh = await (await request("/data/brawlers/amber.json")).json()
  assert.equal(fresh.datasets[0].statistics.win_rate_percent, 68.8)
  assert.equal(fresh.datasets[0].updated_at, "2026-10-05T12:00:00.000Z")
  const repeated = await Promise.all(Array.from({ length: 5 }, async () => (await request("/data/brawlers/amber.json")).json()))
  assert(repeated.every(row => JSON.stringify(row) === JSON.stringify(fresh)))
  for (const path of ["/data/modes/brawl-ball.json", "/data/maps/center-stage.json", "/data/brawlers/index.json"]) assert.equal((await request(path)).status, 200)
  await drain()
  const catalog = await (await request("/data/index.json")).json()
  assert.equal(new Set(catalog.entities.map(row => row.id)).size, catalog.entities.length)
  assert(catalog.entities.some(row => row.page_url.endsWith("/maps/center-stage")))
  const linkedResponse = await request("/data/catalog.jsonld")
  assert.match(linkedResponse.headers.get("Content-Type"), /application\/ld\+json/)
  assert.deepEqual(await linkedResponse.json(), catalog.schema)
  await drain()
  future = true
  const newCharacter = await request("/data/brawlers/future-new-hero.json")
  assert.equal(newCharacter.status, 200)
  assert.match(newCharacter.headers.get("X-Robots-Tag"), /noindex/)
  assert.equal((await newCharacter.json()).entity.name, "新キャラ<テスト>")
  assert.equal((await request("/data/brawlers/missing.json")).status, 404)
  assert.equal((await request("/data/not-supported.json")).status, 404)
  assert.equal((await request("/data/brawlers/amber.json", "POST")).status, 405)
  const head = await request("/data/brawlers/amber.json", "HEAD")
  assert.equal(head.status, 200)
  assert.equal(await head.text(), "")
  now += 301_000; offline = true
  assert.equal((await request("/data/brawlers/amber.json")).status, 200)
  assert.equal((await request("/data/brawlers/uncached-character.json")).status, 503)
  await drain()
  console.log("PASS: public values/units/cohorts, consistent entity & dataset IDs, relationships, real download routes, HTML/JSON parity, source timestamps, cold/stale speed, new-character URLs, low-sample robots, missing/error/HEAD/method handling")
} finally {
  held = null; await drain()
  globalThis.fetch = original.fetch; globalThis.caches = original.caches; Date.now = original.now
}
process.exit(0)
