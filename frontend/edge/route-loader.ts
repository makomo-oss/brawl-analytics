import type { RuntimePage } from "./app"
import { isTierListData } from "@/lib/tier-data"
import { isDraftCategories } from "@/lib/draft-categories"

export function isRuntimePath(path: string) {
  return path === "/" || /^\/(?:player|companion|tier|about|contact)$/.test(path) || /^\/(?:brawlers|modes|maps)(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/.test(path)
}

export function isRuntimePage(value: unknown, path: string): value is RuntimePage {
  if (!value || typeof value !== "object" || !("path" in value) || value.path !== path || !("kind" in value)) return false
  const page = value as RuntimePage
  switch (page.kind) {
    case "player": return path === "/player"
    case "about": return path === "/about"
    case "contact": return path === "/contact"
    case "companion": return path === "/companion" && isDraftCategories(page.categories)
    case "home": case "tier": return path === (page.kind === "home" ? "/" : "/tier") && isTierListData(page.tierData) && !!page.initialMatchups
    case "directory": return path === "/brawlers" && Array.isArray(page.entries)
    case "detail": return path.startsWith("/brawlers/") && !!page.data?.cohorts?.global && !!page.data.cohorts.gachi
    case "conditions": return (page.category === "modes" || page.category === "maps") && path === `/${page.category}` && Array.isArray(page.index?.modes) && Array.isArray(page.index?.maps)
    case "condition": return /^\/(modes|maps)\//.test(path) && !!page.data?.cohorts?.global && !!page.data.cohorts.gachi
    default: return false
  }
}

export type RouteDocument = { page: RuntimePage; html: string }

// Documents remain the source of truth for data, SEO and outage fallbacks.
// A bounded, short-lived memory cache makes revisits immediate without masking
// future statistics updates or accumulating every character visited.
export function createRouteLoader(fetcher: typeof fetch = fetch) {
  const cache = new Map<string, { value: RouteDocument; at: number }>()
  const pending = new Map<string, Promise<RouteDocument>>()
  return {
    async load(path: string): Promise<RouteDocument> {
      if (!isRuntimePath(path)) throw new Error("この画面には移動できません。")
      const cached = cache.get(path)
      if (cached && Date.now() - cached.at < 60_000) return cached.value
      const running = pending.get(path)
      if (running) return running
      const job = (async () => {
        const response = await fetcher(path, { headers: { Accept: "text/html" }, signal: AbortSignal.timeout(15_000) })
        if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) throw new Error("画面を読み込めませんでした。")
        const html = await response.text()
        if (html.length > 4_000_000) throw new Error("画面のデータを取得できませんでした。")
        const raw = html.match(/<script id="brawler-page-data" type="application\/json">([^<]+)<\/script>/)?.[1]
        const page: unknown = raw ? JSON.parse(raw) : null
        if (!isRuntimePage(page, path)) throw new Error("画面のデータを取得できませんでした。")
        const value = { page, html }
        cache.delete(path)
        cache.set(path, { value, at: Date.now() })
        if (cache.size > 12) cache.delete(cache.keys().next().value!)
        return value
      })()
      pending.set(path, job)
      try { return await job } finally { pending.delete(path) }
    },
  }
}
