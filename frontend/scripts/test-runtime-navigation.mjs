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
const originalTimeout = AbortSignal.timeout
try {
  AbortSignal.timeout = undefined
  let receivedSignal
  const fallbackLoader = createRouteLoader(async (_path, init) => {
    receivedSignal = init?.signal
    return new Response(html({ kind: "player", path: "/player" }), { headers: { "Content-Type": "text/html; charset=utf-8" } })
  })
  const doc = await fallbackLoader.load("/player")
  assert.equal(doc.page.kind, "player")
  assert(receivedSignal instanceof AbortSignal, "Fallback timeout should still provide an AbortSignal")
} finally {
  AbortSignal.timeout = originalTimeout
}

const scrollBuild = await build({ entryPoints: ["edge/scroll-history.ts"], bundle: true, format: "esm", platform: "node", write: false })
const { createScrollHistory, MAX_SCROLL_ENTRIES, SCROLL_STORAGE_KEY } = await import(`data:text/javascript;base64,${Buffer.from(scrollBuild.outputFiles[0].contents).toString("base64")}`)

function createMockHistory(initialState = null, { quota = Infinity, failPush = false, failReplace = false } = {}) {
  const entries = [{ state: initialState, url: "/" }]
  let index = 0
  let pushCalls = 0
  let replaceCalls = 0
  const checkQuota = (op) => {
    if (pushCalls + replaceCalls >= quota) {
      const error = new Error(`SecurityError: Attempt to use history.${op}() more than ${quota} times per 30 seconds`)
      error.name = "SecurityError"
      throw error
    }
  }
  return {
    get state() { return entries[index].state },
    get url() { return entries[index].url },
    get pushCalls() { return pushCalls },
    get replaceCalls() { return replaceCalls },
    pushState(state, _title, url = entries[index].url) {
      checkQuota("pushState")
      pushCalls += 1
      if (failPush) {
        const error = new Error("SecurityError")
        error.name = "SecurityError"
        throw error
      }
      entries.splice(index + 1)
      entries.push({ state, url: String(url) })
      index = entries.length - 1
    },
    replaceState(state, _title, url = entries[index].url) {
      checkQuota("replaceState")
      replaceCalls += 1
      if (failReplace) {
        const error = new Error("SecurityError")
        error.name = "SecurityError"
        throw error
      }
      entries[index] = { state, url: String(url) }
    },
    go(delta) {
      index = Math.max(0, Math.min(entries.length - 1, index + delta))
      return entries[index].state
    },
  }
}

function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)) },
  }
}

// 1. iOS Safari / WebKit 100-calls/30s quota simulation during heavy scrolling and tab switching
{
  const history = createMockHistory(null, { quota: 100 })
  let scrollY = 0
  const sh = createScrollHistory({ history, getScrollY: () => scrollY, storage: createMemoryStorage() })
  assert.equal(history.replaceCalls, 1, "Initial mount tags history state once")
  for (let i = 0; i < 250; i += 1) {
    scrollY = i * 10
    sh.recordScroll()
  }
  assert.equal(history.replaceCalls, 1, "Scrolling must never call history.replaceState")
  for (const path of ["/brawlers", "/player", "/tier", "/companion", "/brawlers"]) {
    assert.equal(sh.commit("push", path), true, `Tab switch to ${path} must succeed after heavy scrolling`)
    for (let i = 0; i < 40; i += 1) {
      scrollY = i * 15
      sh.recordScroll()
    }
  }
  assert.equal(history.replaceCalls, 1, "Tab switches and scrolling must not accumulate replaceState calls")
  assert.equal(history.pushCalls, 5)
}

// 2. Back & Forward scroll restoration + 3. Duplicate paths in history
{
  const history = createMockHistory(null)
  let scrollY = 500
  const sh = createScrollHistory({ history, getScrollY: () => scrollY, storage: createMemoryStorage() })
  sh.recordScroll()
  assert.equal(sh.commit("push", "/tier"), true)
  scrollY = 800
  sh.recordScroll()
  assert.equal(sh.commit("push", "/brawlers"), true)
  scrollY = 1400
  sh.recordScroll()

  // Pop back to /tier
  const tierState = history.go(-1)
  assert.equal(sh.resolvePop(tierState), 800, "Pop back to /tier restores 800")
  scrollY = 820
  // Pop back to first /brawlers (or "/")
  const firstState = history.go(-1)
  assert.equal(sh.resolvePop(firstState), 500, "Pop back to initial entry restores 500, not 1400 from second /brawlers")
  // Pop forward to /tier (updated scroll 820) and then second /brawlers (1400)
  assert.equal(sh.resolvePop(history.go(1)), 820, "Forward pop restores updated /tier scroll")
  assert.equal(sh.resolvePop(history.go(1)), 1400, "Forward pop restores second /brawlers scroll 1400")
}

// 4. History API error fallback
{
  const history = createMockHistory({ arenaKey: "k1" }, { failPush: true, failReplace: true })
  let scrollY = 300
  const sh = createScrollHistory({ history, getScrollY: () => scrollY, storage: createMemoryStorage() })
  assert.equal(sh.commit("push", "/tier"), false)
  assert.equal(history.state.arenaKey, "k1", "Failed push preserves current state key")
  assert.equal(sh.commit("replace", "/player"), false)
  assert.equal(history.state.arenaKey, "k1", "Failed replace preserves current state key")
}

// 5. pagehide persistence and reload restoration
{
  const storage = createMemoryStorage()
  const history = createMockHistory(null)
  let scrollY = 640
  const sh1 = createScrollHistory({ history, getScrollY: () => scrollY, storage })
  sh1.commit("push", "/tier")
  scrollY = 950
  sh1.persist()
  assert(storage.getItem(SCROLL_STORAGE_KEY), "persist writes positions to sessionStorage")
  assert.equal(history.state.arenaScroll, 950, "persist saves current scroll on history.state")

  // Simulate returning/reloading into a fresh createScrollHistory instance
  const sh2 = createScrollHistory({ history, getScrollY: () => 0, storage })
  const backState = history.go(-1)
  assert.equal(sh2.resolvePop(backState), 640, "Reloaded session restores prior entry scroll from sessionStorage")

  // persist must not throw if replaceState fails
  const failingHistory = createMockHistory({ arenaKey: "k-fail" }, { failReplace: true })
  const shFail = createScrollHistory({ history: failingHistory, getScrollY: () => 123, storage })
  shFail.persist()
}

// 6. Edge and boundary cases
{
  // Negative / NaN / Infinity scrollY normalized to 0, extra user keys preserved
  const history = createMockHistory({ customFlag: "keep" })
  let scrollY = -50
  const sh = createScrollHistory({ history, getScrollY: () => scrollY, storage: createMemoryStorage() })
  assert.equal(history.state.customFlag, "keep", "Initial replaceState preserves existing history.state keys")
  sh.recordScroll()
  scrollY = Number.NaN
  sh.commit("push", "/tier")
  assert.equal(sh.resolvePop(history.go(-1)), 0, "Negative scrollY normalizes to 0")

  // Non-object initial state
  const primitiveHistory = createMockHistory("not-an-object")
  createScrollHistory({ history: primitiveHistory, getScrollY: () => 0, storage: null })
  assert.equal(typeof primitiveHistory.state.arenaKey, "string")

  // resolvePop(null) (e.g., native #hash entry) and same-key resolvePop
  const hashHistory = createMockHistory(null)
  let y = 410
  const shHash = createScrollHistory({ history: hashHistory, getScrollY: () => y, storage: null })
  shHash.recordScroll()
  assert.equal(shHash.resolvePop(hashHistory.state), 410, "Same-key resolvePop does not overwrite saved scroll")
  assert.equal(shHash.resolvePop(null), 0, "resolvePop(null) returns 0 safely")
  assert.equal(shHash.resolvePop({ arenaScroll: 275 }), 275, "resolvePop without arenaKey falls back to arenaScroll")

  // LRU eviction when exceeding MAX_SCROLL_ENTRIES
  const lruHistory = createMockHistory(null)
  let ly = 0
  const shLru = createScrollHistory({ history: lruHistory, getScrollY: () => ly, storage: null })
  const firstKey = lruHistory.state.arenaKey
  for (let i = 1; i <= MAX_SCROLL_ENTRIES + 5; i += 1) {
    ly = i * 10
    shLru.commit("push", `/brawlers/b${i}`)
  }
  assert.equal(shLru.resolvePop({ arenaKey: firstKey }), 0, "Oldest entry past MAX_SCROLL_ENTRIES is evicted")

  // Throwing storage handled silently
  const throwingStorage = {
    getItem() { throw new Error("SecurityError") },
    setItem() { throw new Error("QuotaExceededError") },
  }
  const throwHist = createMockHistory(null)
  const shThrow = createScrollHistory({ history: throwHist, getScrollY: () => 100, storage: throwingStorage })
  shThrow.persist()
}

console.log("PASS: supported routes, payload validation, concurrent loading, repeat visits, cache expiry, failure recovery, timeout fallback and iOS scroll history")
