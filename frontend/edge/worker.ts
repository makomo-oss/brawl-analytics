import { brawlerEntries, brawlerPage, type BrawlerSnapshot } from "@/lib/brawler-page-data"
import { isTierListData } from "@/lib/tier-data"
import { SITE_URL } from "@/lib/seo"
import { renderPage, escapeHtml, runtimeVersion } from "./server"

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
      !snapshot.details?.global || !snapshot.details.gachi || !snapshot.contexts?.global || !snapshot.contexts.gachi) throw new Error("Invalid statistics")
}

async function api(env: Env, path: string) {
  const base = new URL(env.NEXT_PUBLIC_API_URL)
  if (base.protocol !== "https:" && base.hostname !== "127.0.0.1") throw new Error("Invalid statistics origin")
  return readJson(await fetch(new URL(path, base), { signal: AbortSignal.timeout(45_000) }))
}

async function inputs(env: Env) {
  const [index, catalog] = await Promise.all([api(env, "/meta/brawler-pages"), api(env, "/meta/brawlers")])
  validateSnapshot(index)
  const rows = catalog && typeof catalog === "object" && "brawlers" in catalog ? catalog.brawlers : null
  if (!Array.isArray(rows) || rows.some(row => !row || typeof row.name !== "string" || typeof row.nameJa !== "string" || typeof row.imageUrl !== "string")) throw new Error("Invalid character catalog")
  index.catalog = rows
  return index
}

function xml(index: BrawlerSnapshot) {
  const paths = ["/", "/tier", "/player", "/companion", "/brawlers"]
  const entries = brawlerEntries(index).filter(entry => Object.values(index.overview).some(data => data.characters[entry.name]?.sample_sufficient))
  const dates = Object.values(index.overview).flatMap(data => {
    const raw = data.updated_at
    if (!raw) return []
    const stamp = Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : `${raw}Z`)
    return Number.isFinite(stamp) ? [new Date(stamp).toISOString()] : []
  }).sort().reverse()
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(path => `<url><loc>${SITE_URL}${path}</loc></url>`).join("")}${entries.map(entry => `<url><loc>${SITE_URL}/brawlers/${escapeHtml(entry.slug)}</loc>${dates[0] ? `<lastmod>${dates[0]}</lastmod>` : ""}</url>`).join("")}</urlset>`
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const isDynamic = url.pathname === "/brawlers" || url.pathname.startsWith("/brawlers/") || url.pathname === "/sitemap.xml"
    if (!isDynamic) return env.ASSETS.fetch(request)
    if (!["GET", "HEAD"].includes(request.method)) return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } })
    const path = url.pathname.replace(/\/$/, "")
    if (path !== url.pathname) return Response.redirect(`${url.origin}${path}${url.search}`, 308)
    if (!/^\/brawlers(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/.test(path) && path !== "/sitemap.xml") return env.ASSETS.fetch(new Request(`${url.origin}/404.html`)).then(response => new Response(request.method === "HEAD" ? null : response.body, { status: 404, headers: response.headers }))
    const key = new Request(`${url.origin}/__brawler-cache/${runtimeVersion}${path}`)
    const cache = await caches.open("brawler-pages")
    const cached = await cache.match(key)
    const fresh = cached && Date.now() - Number(cached.headers.get("X-Brawler-Generated")) < FRESH_SECONDS * 1000
    const serve = (response: Response) => {
      const headers = new Headers(response.headers)
      headers.set("Cache-Control", "public, max-age=0, must-revalidate")
      return new Response(request.method === "HEAD" ? null : response.body, { status: response.status, headers })
    }
    if (fresh) return serve(cached)
    try {
      const index = await inputs(env)
      let body: string
      if (path === "/sitemap.xml") body = xml(index)
      else if (path === "/brawlers") body = renderPage({ kind: "directory", path, entries: brawlerEntries(index) })
      else {
        const entry = brawlerEntries(index).find(entry => path === `/brawlers/${entry.slug}`)
        if (!entry) {
          // Never cache a missing URL: a newly observed character can appear immediately.
          const missing = await env.ASSETS.fetch(new Request(`${url.origin}/404.html`))
          return new Response(request.method === "HEAD" ? null : missing.body, { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } })
        }
        const snapshot = await api(env, `/meta/brawler-pages/${encodeURIComponent(entry.name)}`)
        validateSnapshot(snapshot)
        snapshot.catalog = index.catalog
        const data = brawlerPage(snapshot, entry.slug)
        if (!data) throw new Error("Character disappeared from statistics")
        body = renderPage({ kind: "detail", path, data })
      }
      const response = new Response(body, { headers: {
        "Content-Type": path === "/sitemap.xml" ? "application/xml; charset=utf-8" : "text/html; charset=utf-8",
        "Cache-Control": `public, max-age=${STALE_SECONDS}`,
        "X-Brawler-Generated": String(Date.now()), "X-Brawler-Rendering": "live",
      } })
      ctx.waitUntil(cache.put(key, response.clone()).catch((error: unknown) => console.error("Character cache write failed", String(error))))
      return serve(response)
    } catch (error) {
      console.error("Character page unavailable", path, String(error))
      if (cached) return serve(cached)
      return new Response("集計データを取得できませんでした。時間をおいて再度お試しください。", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "60", "X-Robots-Tag": "noindex" } })
    }
  },
} satisfies ExportedHandler<Parameters<PagesFunction<Env>>[0]["env"]>
