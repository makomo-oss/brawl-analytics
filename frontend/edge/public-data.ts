import { publicCatalog, publicData, type PublicPage } from "@/lib/llm-data"
import { SITE_URL } from "@/lib/seo"

async function readPage(response: Response, path: string): Promise<PublicPage> {
  if (response.status !== 200 || !response.body) throw new Error(`Page returned ${response.status}`)
  const reader = response.body.getReader(), decoder = new TextDecoder()
  let text = "", bytes = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > 2_000_000) throw new Error("Page too large")
      text += decoder.decode(chunk.value, { stream: true })
    }
    text += decoder.decode()
  } finally { await reader.cancel() }
  const payload = text.match(/<script id="brawler-page-data" type="application\/json">([^<]+)<\/script>/)?.[1]
  if (!payload) throw new Error("Page has no public payload")
  // This payload comes from our own renderer, not a separately fetched API.
  const page = JSON.parse(payload) as PublicPage
  if (page.path !== path || !["detail", "directory", "condition", "conditions"].includes(page.kind) ||
    (page.kind === "directory" && !Array.isArray(page.entries)) ||
    (page.kind === "conditions" && (!Array.isArray(page.index?.modes) || !Array.isArray(page.index?.maps))) ||
    ((page.kind === "detail" || page.kind === "condition") && (!page.data?.cohorts?.global || !page.data.cohorts.gachi))) throw new Error("Invalid public payload")
  return page
}

export async function dataResponse(request: Request, fetchPage: (request: Request) => Promise<Response>) {
  const url = new URL(request.url)
  if (!["GET", "HEAD"].includes(request.method)) return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } })
  const match = url.pathname.match(/^\/data\/(brawlers|modes|maps)\/(index|[a-z0-9]+(?:-[a-z0-9]+)*)\.json$/)
  const isLinkedData = url.pathname === "/data/catalog.jsonld"
  const isCatalog = isLinkedData || url.pathname === "/data/index.json"
  if (!match && !isCatalog) return new Response(request.method === "HEAD" ? null : JSON.stringify({ error: "not_found" }), { status: 404, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } })
  const paths = isCatalog ? ["/brawlers", "/modes", "/maps"] : [`/${match![1]}${match![2] === "index" ? "" : `/${match![2]}`}`]
  try {
    const sources = await Promise.all(paths.map(path => fetchPage(new Request(`${url.origin}${path}`, { headers: { Accept: "text/html" } }))))
    const failed = sources.find(response => response.status !== 200)
    if (failed) {
      await Promise.all(sources.map(response => response.body?.cancel()))
      return new Response(request.method === "HEAD" ? null : JSON.stringify({ error: failed.status === 404 ? "not_found" : "statistics_unavailable" }), { status: failed.status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } })
    }
    const pages = await Promise.all(sources.map((source, i) => readPage(source, paths[i])))
    const payload = isCatalog ? isLinkedData ? publicCatalog(pages).schema : publicCatalog(pages) : publicData(pages[0])
    return new Response(request.method === "HEAD" ? null : JSON.stringify(payload), { headers: {
      "Content-Type": `${isLinkedData ? "application/ld+json" : "application/json"}; charset=utf-8`, "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=0, must-revalidate",
      "Content-Location": `${SITE_URL}${url.pathname}`,
      "X-Robots-Tag": "noindex, follow",
      Link: `<${SITE_URL}/data/catalog.jsonld>; rel="describedby"${isCatalog ? "" : `, <${SITE_URL}${paths[0]}>; rel="canonical"`}`,
      ...(!isCatalog && sources[0].headers.get("X-Brawler-Rendering") ? { "X-Brawler-Rendering": sources[0].headers.get("X-Brawler-Rendering")! } : {}),
    } })
  } catch (error) {
    console.error("Public statistics unavailable", url.pathname, String(error))
    return new Response(request.method === "HEAD" ? null : JSON.stringify({ error: "statistics_unavailable" }), { status: 503, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "60", "X-Robots-Tag": "noindex" } })
  }
}
