import { brawlerEntries, brawlerPage, type BrawlerSnapshot, type CharacterStats } from "@/lib/brawler-page-data"
import { isTierListData } from "@/lib/tier-data"
import { SITE_URL } from "@/lib/seo"
import { renderPage, escapeHtml, runtimeVersion } from "./server"
import { conditionPage, conditionIndex, MODE_SLUGS, mapSlug, type ConditionEntry, type ConditionIndex } from "@/lib/condition-pages"
import { translateMap, translateMode } from "@/lib/translations"
import type { OverviewPage, RuntimePage } from "./app"
import { dataResponse } from "./public-data"
import { isDraftCategories } from "@/lib/draft-categories"
import { llmsFullTxt, llmsTxt } from "@/lib/llms-txt"
import { ABOUT_REVISED } from "@/lib/about"
import { normalizeDate } from "@/lib/dates"

// Non-HTML documents generated from the same snapshot and cache as pages.
const TEXT_TYPES: Record<string, string> = { "/sitemap.xml": "application/xml; charset=utf-8", "/llms.txt": "text/plain; charset=utf-8", "/llms-full.txt": "text/plain; charset=utf-8" }
const contentType = (path: string) => TEXT_TYPES[path] || "text/html; charset=utf-8"
const extraHeaders = (path: string): Record<string, string> => path.startsWith("/llms") ? { "X-Robots-Tag": "noindex" } : {}
function textBody(path: string, index: BrawlerSnapshot, conditions: ConditionIndex) {
  return path === "/sitemap.xml" ? xml(index, conditions) : path === "/llms.txt" ? llmsTxt(index) : llmsFullTxt(index, conditions)
}

const FRESH_SECONDS = 300
const STALE_SECONDS = 86400

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok || !response.body) throw new Error(`Statistics API returned ${response.status}`)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let text = "", bytes = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > 2_000_000) throw new Error("Statistics response too large")
      text += decoder.decode(value, { stream: true })
    }
    return JSON.parse(text + decoder.decode())
  } finally { await reader.cancel() }
}

function validateSnapshot(value: unknown): asserts value is BrawlerSnapshot {
  if (!value || typeof value !== "object") throw new Error("Invalid statistics")
  const snapshot = value as BrawlerSnapshot
  if (!snapshot.overview || !isTierListData(snapshot.overview.global) || !isTierListData(snapshot.overview.gachi) ||
      !Object.values(snapshot.overview).every(data => Object.values(data.characters).some(row => row.total_matches > 0)) ||
      !snapshot.details?.global || !snapshot.details.gachi || !snapshot.contexts?.global || !snapshot.contexts.gachi) throw new Error("Invalid statistics")
}

async function api(env: Env, path: string, signal = AbortSignal.timeout(45_000)) {
  const base = new URL(env.NEXT_PUBLIC_API_URL)
  if (base.protocol !== "https:" && base.hostname !== "127.0.0.1") throw new Error("Invalid statistics origin")
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(new URL(path, base), { signal })
      if (attempt === 0 && (response.status >= 500 || response.status === 429)) {
        await response.body?.cancel()
        await new Promise(resolve => setTimeout(resolve, 250))
        continue
      }
      return await readJson(response)
    } catch (error) {
      if (attempt === 1 || signal.aborted) throw error
      await new Promise(resolve => setTimeout(resolve, 250))
    }
  }
  throw new Error("Statistics fetch failed")
}

async function inputs(env: Env, signal: AbortSignal) {
  const [index, catalog] = await Promise.all([api(env, "/meta/brawler-pages", signal), api(env, "/meta/brawlers", signal)])
  validateSnapshot(index)
  const rows = catalog && typeof catalog === "object" && "brawlers" in catalog ? catalog.brawlers : null
  if (!Array.isArray(rows) || rows.some(row => !row || typeof row.name !== "string" || typeof row.nameJa !== "string" || typeof row.imageUrl !== "string")) throw new Error("Invalid character catalog")
  index.catalog = rows
  return index
}

async function overviewPreviews(env: Parameters<PagesFunction<Env>>[0]["env"], origin: string, kind: "home" | "tier"): Promise<OverviewPage["initialMatchups"]> {
  try {
    const page = await readJson(await env.ASSETS.fetch(new Request(`${origin}/__overview-snapshots/${kind}.json`))) as OverviewPage
    if (page.kind === kind && page.initialMatchups?.global && page.initialMatchups.gachi) return page.initialMatchups
  } catch { /* A missing snapshot must not prevent live Tier updates. */ }
  return { global: {}, gachi: {} }
}

async function buildConditionManifest(env: Parameters<PagesFunction<Env>>[0]["env"], origin: string): Promise<ConditionIndex> {
  const value = await readJson(await env.ASSETS.fetch(new Request(`${origin}/__condition-snapshots/index.json`))) as ConditionIndex
  if (!Array.isArray(value.modes) || !Array.isArray(value.maps) || [...value.modes, ...value.maps].some(entry => !/^\/(?:modes|maps)\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.path) || !entry.ids || !Array.isArray(entry.modeIds))) throw new Error("Invalid condition directory")
  return value
}

// Both hubs and the sitemap consume this one inventory. Only publish a complete
// refresh; a failed scope request must not remove healthy URLs from the sitemap.
async function conditionManifest(env: Parameters<PagesFunction<Env>>[0]["env"], origin: string, signal: AbortSignal): Promise<ConditionIndex> {
  const cache = await caches.open("brawler-pages")
  const key = new Request(`${origin}/__condition-index/${runtimeVersion}`)
  const cached = await cache.match(key)
  if (cached && Date.now() - Number(cached.headers.get("X-Brawler-Generated")) < FRESH_SECONDS * 1000) return await readJson(cached) as ConditionIndex
  const snapshot = await inputs(env, signal)
  const jobs: { type: "global" | "gachi"; kind: "modes" | "maps"; id: string }[] = []
  for (const type of ["global", "gachi"] as const) {
    const categories = await api(env, `/meta/categories?type=${type}`, signal) as { mode_to_maps: Record<string, string[]> }
    if (!categories?.mode_to_maps || Object.values(categories.mode_to_maps).some(ids => !Array.isArray(ids) || ids.some(id => typeof id !== "string"))) throw new Error("Invalid condition inventory")
    const mapModes: Record<string, string[]> = {}
    const modes = Object.keys(categories.mode_to_maps).filter(id => MODE_SLUGS[id])
    for (const mode of modes) for (const id of categories.mode_to_maps[mode]) (mapModes[id] ||= []).push(mode)
    snapshot.mapModes ||= { global: {}, gachi: {} }
    snapshot.mapModes[type] = mapModes
    snapshot.contextUpdatedAt ||= { global: { modes: {}, maps: {} }, gachi: { modes: {}, maps: {} } }
    for (const kind of ["modes", "maps"] as const) for (const id of kind === "modes" ? modes : Object.keys(mapModes)) jobs.push({ type, kind, id })
  }
  // A complete inventory can contain hundreds of scopes. Cache immutable chunks
  // across visits instead of exceeding the per-invocation subrequest budget.
  const signature = JSON.stringify([cached?.headers.get("X-Brawler-Generated") || "initial", snapshot.mapModes, Object.values(snapshot.overview).map(data => data.updated_at), jobs])
  const generation = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(signature)))].map(byte => byte.toString(16).padStart(2, "0")).join("")
  const chunkSize = 16
  let fetchedChunk = false
  for (let offset = 0; offset < jobs.length; offset += chunkSize) {
    const chunkKey = new Request(`${origin}/__condition-index/${runtimeVersion}/${generation}/${offset}`)
    const stored = await cache.match(chunkKey)
    if (!stored && fetchedChunk) return cached ? await readJson(cached) as ConditionIndex : await buildConditionManifest(env, origin)
    type Scope = typeof jobs[number] & { characters: Record<string, CharacterStats>; updatedAt: string | null }
    let scopes: Scope[]
    if (stored) scopes = await readJson(stored) as Scope[]
    else {
      const rows = jobs.slice(offset, offset + chunkSize)
      scopes = []
      const consume = async () => {
        while (rows.length) {
          const row = rows.shift()!
          const data = await api(env, `/meta/tier-list?type=${row.type}&rank_tier=all&sub_type=${row.kind === "modes" ? "mode" : "map"}&id=${encodeURIComponent(row.id)}&include_details=false`, signal)
          if (!isTierListData(data) || Object.values(data.characters).some(stats => !Number.isFinite(stats.total_matches) || stats.total_matches < 0 || typeof stats.sample_sufficient !== "boolean")) throw new Error("Invalid condition inventory statistics")
          // Eligibility needs only one positive, preferably sufficient, real row.
          const positive = Object.entries(data.characters).filter(([, stats]) => stats.total_matches > 0)
          const selected = positive.find(([, stats]) => stats.sample_sufficient) || positive[0]
          scopes.push({ ...row, characters: selected ? { [selected[0]]: selected[1] as CharacterStats } : {}, updatedAt: data.updated_at })
        }
      }
      await Promise.all([consume(), consume()])
      await cache.put(chunkKey, Response.json(scopes, { headers: { "Cache-Control": `public, max-age=${STALE_SECONDS}` } }))
      fetchedChunk = true
    }
    for (const row of scopes) {
      snapshot.contexts[row.type][row.kind][row.id] = row.characters
      snapshot.contextUpdatedAt![row.type][row.kind][row.id] = row.updatedAt
    }
  }
  const index = conditionIndex(snapshot)
  await cache.put(key, Response.json(index, { headers: { "Cache-Control": `public, max-age=${STALE_SECONDS}`, "X-Brawler-Generated": String(Date.now()) } }))
  return index
}

async function liveCondition(env: Parameters<PagesFunction<Env>>[0]["env"], origin: string, path: string, signal: AbortSignal): Promise<RuntimePage | null> {
  const kind = path.startsWith("/modes") ? "modes" : "maps"
  if (path === `/${kind}`) return { kind: "conditions", path, category: kind, index: await conditionManifest(env, origin, signal) }
  // Details need their own scopes, not a refresh of hundreds of unrelated
  // scopes. Hubs/sitemap advance the shared inventory; reuse its last complete
  // generation (or the build) even when the inventory APIs are unavailable.
  const cache = await caches.open("brawler-pages")
  const stored = await cache.match(new Request(`${origin}/__condition-index/${runtimeVersion}`))
  const directory = stored ? await readJson(stored) as ConditionIndex : await buildConditionManifest(env, origin)
  let entry = directory[kind].find(row => row.path === path)
  if (!entry && kind === "modes") {
    const id = Object.keys(MODE_SLUGS).find(id => path === `/modes/${MODE_SLUGS[id]}`)
    if (id) entry = { kind, path, slug: MODE_SLUGS[id], label: translateMode(id), ids: { global: id, ...(!["soloShowdown", "duoShowdown"].includes(id) ? { gachi: id } : {}) }, modeIds: [id], updatedAt: null }
  }
  // A newly observed map can resolve from the live categories before a rebuild.
  if (!entry && kind === "maps") {
    const categories = await Promise.all((["global", "gachi"] as const).map(async type => {
      const data = await api(env, `/meta/categories?type=${type}`, signal) as { mode_to_maps: Record<string, string[]> }
      if (!data?.mode_to_maps || Object.values(data.mode_to_maps).some(maps => !Array.isArray(maps) || maps.some(id => typeof id !== "string"))) throw new Error("Invalid map categories")
      return { type, maps: Object.entries(data.mode_to_maps).filter(([mode]) => MODE_SLUGS[mode]).flatMap(([mode, maps]) => maps.map(id => ({ mode, id }))) }
    }))
    const resolved: ConditionEntry = { kind, path, slug: path.split("/").pop()!, label: "", ids: {}, modeIds: [], updatedAt: null }
    for (const { type, maps } of categories) for (const { mode, id } of maps.filter(row => mapSlug(row.id) === resolved.slug)) {
      if (resolved.ids[type] && resolved.ids[type] !== id) throw new Error("Duplicate map URL")
      resolved.ids[type] = id; resolved.label = translateMap(id); resolved.modeIds = [...new Set([...resolved.modeIds, mode])]
    }
    if (resolved.label) entry = resolved
  }
  if (!entry) return null
  const selected = entry
  const [snapshot, tiers] = await Promise.all([inputs(env, signal), Promise.all((["global", "gachi"] as const).map(async type => {
    const id = selected.ids[type]
    if (!id) return null
    const data = await api(env, `/meta/tier-list?type=${type}&rank_tier=all&sub_type=${kind === "modes" ? "mode" : "map"}&id=${encodeURIComponent(id)}&include_details=false`, signal)
    if (!isTierListData(data) || Object.values(data.characters).some(row => ![row.score, row.win_rate, row.use_rate, row.total_matches].every(Number.isFinite) || row.total_matches < 0 || (row.sample_sufficient !== undefined && typeof row.sample_sufficient !== "boolean"))) throw new Error("Invalid condition statistics")
    return { type, id, data }
  }))])
  for (const tier of tiers) if (tier) {
    snapshot.contexts[tier.type][kind][tier.id] = tier.data.characters as Record<string, CharacterStats>
    snapshot.contextUpdatedAt ||= { global: { modes: {}, maps: {} }, gachi: { modes: {}, maps: {} } }
    snapshot.contextUpdatedAt[tier.type][kind][tier.id] = tier.data.updated_at
  }
  return { kind: "condition", path, data: conditionPage(snapshot, selected, directory) }
}

function xml(index: BrawlerSnapshot, conditions: ConditionIndex = { modes: [], maps: [] }) {
  const paths = ["/", "/tier", "/player", "/companion", "/brawlers", "/modes", "/maps", "/about"]
  const entries = brawlerEntries(index).filter(entry => Object.values(index.overview).some(data => data.characters[entry.name]?.sample_sufficient))
  const dates = Object.values(index.overview).flatMap(data => {
    const raw = data.updated_at
    if (!raw) return []
    const stamp = Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : `${raw}Z`)
    return Number.isFinite(stamp) ? [new Date(stamp).toISOString()] : []
  }).sort().reverse()
  const conditionUrls = [...conditions.modes, ...conditions.maps].map(entry => `<url><loc>${SITE_URL}${escapeHtml(entry.path)}</loc>${entry.updatedAt ? `<lastmod>${escapeHtml(entry.updatedAt)}</lastmod>` : ""}</url>`).join("")
  const cohortDate = (type: "global" | "gachi") => normalizeDate(index.overview[type].updated_at)
  const lastmod: Record<string, string | null | undefined> = { "/": cohortDate("gachi"), "/tier": cohortDate("global"), "/brawlers": dates[0], "/modes": dates[0], "/maps": dates[0], "/about": ABOUT_REVISED }
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(path => `<url><loc>${SITE_URL}${path}</loc>${lastmod[path] ? `<lastmod>${lastmod[path]}</lastmod>` : ""}</url>`).join("")}${conditionUrls}${entries.map(entry => `<url><loc>${SITE_URL}/brawlers/${escapeHtml(entry.slug)}</loc>${dates[0] ? `<lastmod>${dates[0]}</lastmod>` : ""}</url>`).join("")}</urlset>`
}

const worker = {
  async fetch(request: Request, env, ctx): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname.startsWith("/data/")) return dataResponse(request, source => worker.fetch(source, env, ctx))
    const isCondition = /^\/(?:modes|maps)(?:\/|$)/.test(url.pathname)
    const isOverview = url.pathname === "/" || /^\/tier\/?$/.test(url.pathname)
    const isTool = /^\/(?:player|about)\/?$/.test(url.pathname)
    const isCompanion = /^\/companion\/?$/.test(url.pathname)
    const isDynamic = isTool || isCompanion || isOverview || isCondition || url.pathname === "/brawlers" || url.pathname.startsWith("/brawlers/") || !!TEXT_TYPES[url.pathname]
    if (!isDynamic) return env.ASSETS.fetch(request)
    if (!["GET", "HEAD"].includes(request.method)) return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } })
    const path = url.pathname === "/" ? "/" : url.pathname.replace(/\/$/, "")
    if (path !== url.pathname) return Response.redirect(`${url.origin}${path}${url.search}`, 308)
    if (isTool) {
      // Tool documents contain no player data or query values. Reuse the same
      // shell as public pages so every entry URL can navigate without reloads.
      const document = await env.ASSETS.fetch(new Request(`${url.origin}/__rendered-pages${path}.document`))
      const body = document.ok ? document.body : renderPage(path === "/about" ? { kind: "about", path: "/about" } : { kind: "player", path: "/player" })
      return new Response(request.method === "HEAD" ? null : body, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=0, must-revalidate" } })
    }
    if (!/^\/(?:brawlers|modes|maps)(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/.test(path) && !TEXT_TYPES[path] && !isOverview && !isCompanion) return env.ASSETS.fetch(new Request(`${url.origin}/404.html`)).then(response => new Response(request.method === "HEAD" ? null : response.body, { status: 404, headers: response.headers }))
    const key = new Request(`${url.origin}/__brawler-cache/${runtimeVersion}${path}`)
    const cache = await caches.open("brawler-pages")
    let cached = await cache.match(key)
    const fresh = cached && Date.now() - Number(cached.headers.get("X-Brawler-Generated")) < FRESH_SECONDS * 1000
    const serve = (response: Response) => {
      const headers = new Headers(response.headers)
      headers.set("Cache-Control", "public, max-age=0, must-revalidate")
      return new Response(request.method === "HEAD" ? null : response.body, { status: response.status, headers })
    }
    if (cached && fresh) return serve(cached)
    const regenerate = async (signal: AbortSignal) => {
      let body: string
      if (isCompanion) {
        const categories = await api(env, "/meta/categories?type=gachi", signal)
        if (!isDraftCategories(categories)) throw new Error("Invalid draft categories")
        body = renderPage({ kind: "companion", path: "/companion", categories })
      } else if (isCondition) {
        const page = await liveCondition(env, url.origin, path, signal)
        if (!page) {
          const missing = await env.ASSETS.fetch(new Request(`${url.origin}/404.html`))
          return new Response(missing.body, { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } })
        }
        body = renderPage(page)
      } else {
        const index = await inputs(env, signal)
        if (isOverview) {
          // The live index deliberately omits pair statistics. Preserve the
          // build's compact TOP5 so a refreshed document can still open panels
          // immediately; each panel revalidates its own live/filtered data.
          const initialMatchups = await overviewPreviews(env, url.origin, path === "/" ? "home" : "tier")
          body = renderPage({ ...(path === "/" ? { kind: "home", path: "/" } as const : { kind: "tier", path: "/tier" } as const), tierData: index.overview[path === "/" ? "gachi" : "global"], initialMatchups })
        }
        else if (TEXT_TYPES[path]) body = textBody(path, index, await conditionManifest(env, url.origin, signal))
        else if (path === "/brawlers") body = renderPage({ kind: "directory", path, entries: brawlerEntries(index) })
        else {
          const entry = brawlerEntries(index).find(entry => path === `/brawlers/${entry.slug}`)
          if (!entry) {
            // Never cache a missing URL: a newly observed character can appear immediately.
            const missing = await env.ASSETS.fetch(new Request(`${url.origin}/404.html`))
            return new Response(request.method === "HEAD" ? null : missing.body, { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } })
          }
          const snapshot = await api(env, `/meta/brawler-pages/${encodeURIComponent(entry.name)}`, signal)
          validateSnapshot(snapshot)
          snapshot.catalog = index.catalog
          const data = brawlerPage(snapshot, entry.slug)
          if (!data) throw new Error("Character disappeared from statistics")
          body = renderPage({ kind: "detail", path, data })
        }
      }
      const response = new Response(body, { headers: {
        "Content-Type": contentType(path), ...extraHeaders(path),
        "Cache-Control": `public, max-age=${STALE_SECONDS}`,
        "X-Brawler-Generated": String(Date.now()), "X-Brawler-Rendering": "live",
      } })
      await cache.put(key, response.clone()).catch((error: unknown) => console.error("Character cache write failed", String(error)))
      return response
    }
    // The build snapshot uses the same renderer and real statistics as live
    // pages. It avoids blocking a first visit on a cold statistics backend.
    if (!cached) {
      try {
        // Export caches can contain an old document for a now-ineligible map.
        // Only current inventory members may use a build fallback; other URLs
        // resolve live, preserving their current noindex or missing status.
        if (isCondition && path !== "/modes" && path !== "/maps") {
          const inventory = await buildConditionManifest(env, url.origin)
          if (![...inventory.modes, ...inventory.maps].some(entry => entry.path === path)) throw new Error("No eligible build fallback")
        }
        // Ready-to-serve documents avoid parsing and rendering the same build
        // snapshot on every cold edge location (including during API outages).
        const document = TEXT_TYPES[path] ? null : await env.ASSETS.fetch(new Request(`${url.origin}/__rendered-pages${path === "/" ? "/index" : path}.document`))
        if (document?.ok) {
          cached = new Response(document.body, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": `public, max-age=${STALE_SECONDS}`, "X-Brawler-Generated": "0", "X-Brawler-Rendering": "snapshot" } })
        } else if (isCompanion) {
          const page = await readJson(await env.ASSETS.fetch(new Request(`${url.origin}/__companion-snapshots/index.json`))) as RuntimePage
          if (page.kind !== "companion" || page.path !== path || !isDraftCategories(page.categories)) throw new Error("Invalid draft snapshot")
          cached = new Response(renderPage(page), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": `public, max-age=${STALE_SECONDS}`, "X-Brawler-Generated": "0", "X-Brawler-Rendering": "snapshot" } })
        } else if (isOverview) {
          const page = await readJson(await env.ASSETS.fetch(new Request(`${url.origin}/__overview-snapshots/${path === "/" ? "home" : "tier"}.json`))) as import("./app").OverviewPage
          if (page.path !== path || page.kind !== (path === "/" ? "home" : "tier") || !isTierListData(page.tierData) || !page.initialMatchups) throw new Error("Invalid overview snapshot")
          cached = new Response(renderPage(page), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": `public, max-age=${STALE_SECONDS}`, "X-Brawler-Generated": "0", "X-Brawler-Rendering": "snapshot" } })
        } else if (isCondition) {
          const page = await readJson(await env.ASSETS.fetch(new Request(`${url.origin}/__condition-snapshots${path}.json`))) as RuntimePage
          if (page.path !== path || !["condition", "conditions"].includes(page.kind)) throw new Error("Invalid condition snapshot")
          cached = new Response(renderPage(page), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": `public, max-age=${STALE_SECONDS}`, "X-Brawler-Generated": "0", "X-Brawler-Rendering": "snapshot" } })
        } else {
          const assetName = path.startsWith("/brawlers/") ? path.slice("/brawlers/".length) : "index"
          const snapshot = await readJson(await env.ASSETS.fetch(new Request(`${url.origin}/__brawler-snapshots/${assetName}.json`)))
          validateSnapshot(snapshot)
          const data = path.startsWith("/brawlers/") ? brawlerPage(snapshot, assetName) : null
          const body = TEXT_TYPES[path] ? textBody(path, snapshot, await buildConditionManifest(env, url.origin)) : path === "/brawlers" ? renderPage({ kind: "directory", path, entries: brawlerEntries(snapshot) }) : data ? renderPage({ kind: "detail", path, data }) : null
          if (body) cached = new Response(body, { headers: {
            "Content-Type": contentType(path), ...extraHeaders(path),
            "Cache-Control": `public, max-age=${STALE_SECONDS}`,
            "X-Brawler-Generated": "0", "X-Brawler-Rendering": "snapshot",
          } })
        }
      } catch { /* New characters have no build snapshot: fetch them live. */ }
    }
    if (cached) {
      const fallback = cached.clone()
      ctx.waitUntil((async () => {
        if (fallback.headers.get("X-Brawler-Rendering") === "snapshot") await cache.put(key, fallback).catch((error: unknown) => console.error("Character snapshot cache write failed", String(error)))
        // waitUntil has a 30-second post-response budget. Bound the whole refresh.
        await regenerate(AbortSignal.timeout(25_000))
      })().catch((error: unknown) => console.error("Character refresh failed", path, String(error))))
      return serve(cached)
    }
    try {
      return serve(await regenerate(AbortSignal.timeout(45_000)))
    } catch (error) {
      console.error("Character page unavailable", path, String(error))
      if (cached) return serve(cached)
      return new Response("集計データを取得できませんでした。時間をおいて再度お試しください。", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "60", "X-Robots-Tag": "noindex" } })
    }
  },
} satisfies ExportedHandler<Parameters<PagesFunction<Env>>[0]["env"]>
export default worker
