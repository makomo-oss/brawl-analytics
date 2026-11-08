import { renderToString } from "react-dom/server.browser"
import { App, type RuntimePage } from "./app"
import { SITE_URL, searchCopy } from "@/lib/seo"
import shell from "./generated-shell.json"
import { collectionSchema, conditionSchema, conditionBreadcrumbs, normalizeDate } from "@/lib/condition-pages"
import { pageSchema, dataPath, indexablePage } from "@/lib/llm-data"
import { siteNodes, SITE_ID, PUBLISHER_ID, reference } from "@/lib/site-schema"
import { brawlerCopy, companionCopy, conditionHubCopy, conditionPageCopy, playerCopy, tierCopy } from "@/lib/page-copy"
import { tierSummary } from "@/lib/page-insights"
import { aboutCopy, ABOUT_REVISED } from "@/lib/about"
import { COMPANION_FAQ, PLAYER_FAQ, brawlerFaq, faqNode, tierFaq } from "@/lib/faq"

export const escapeHtml = (text: string) => text.replace(/[&<>"']/g, value => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[value]!)
const safeJson = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c")

function pageCopy(page: RuntimePage) {
  switch (page.kind) {
    case "home": return searchCopy.home
    case "tier": return tierCopy(page.tierData, Date.now())
    case "player": return playerCopy
    case "companion": return companionCopy
    case "about": return aboutCopy
    case "detail": return brawlerCopy(page.data)
    case "condition": return conditionPageCopy(page.data)
    case "conditions": return conditionHubCopy(page.category, page.index)
    default: return searchCopy.brawlers
  }
}

function generalNodes(page: RuntimePage, url: string, name: string) {
  const nodes: (Record<string, unknown> | null)[] = []
  const webPage: Record<string, unknown> = { "@type": "WebPage", "@id": url, url, name, inLanguage: "ja", isPartOf: reference(SITE_ID),
    dateModified: (page.kind === "home" || page.kind === "tier") ? normalizeDate(page.tierData.updated_at) || undefined : undefined }
  nodes.push(webPage)
  if (page.kind === "tier") {
    const summary = tierSummary(page.tierData, "global")
    if (summary) {
      webPage.mainEntity = reference(`${url}#top10`)
      nodes.push({ "@type": "ItemList", "@id": `${url}#top10`, name: "全体Tier 上位10キャラ", itemListOrder: "https://schema.org/ItemListOrderAscending", numberOfItems: summary.top.length,
        itemListElement: summary.top.map(row => ({ "@type": "ListItem", position: row.rank, name: row.name, url: `${SITE_URL}/brawlers/${row.slug}` })) })
    }
    nodes.push(faqNode(url, tierFaq(summary, page.tierData)))
  }
  if (page.kind === "about") Object.assign(webPage, { "@type": "AboutPage", about: reference(PUBLISHER_ID), dateModified: ABOUT_REVISED })
  if (page.kind === "player") nodes.push(faqNode(url, PLAYER_FAQ))
  if (page.kind === "companion") nodes.push(faqNode(url, COMPANION_FAQ))
  return nodes.filter(Boolean) as Record<string, unknown>[]
}

export function renderPage(page: RuntimePage) {
  const overview = page.kind === "home" || page.kind === "tier"
  const general = overview || page.kind === "player" || page.kind === "companion" || page.kind === "about"
  const isDetail = page.kind === "detail"
  const name = isDetail ? page.data.nameJa : ""
  const copy = pageCopy(page)
  const title = `${copy.title} | ブロラボ`
  const description = copy.description
  const index = general || indexablePage(page as import("@/lib/llm-data").PublicPage)
  const url = `${SITE_URL}${page.path}`
  const breadcrumb = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
    { "@type": "ListItem", position: 1, name: "ホーム", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "キャラ一覧", item: `${SITE_URL}/brawlers` },
    ...(isDetail ? [{ "@type": "ListItem", position: 3, name, item: url }] : []),
  ] }
  const schema = page.kind === "condition" ? conditionSchema(page.data) : page.kind === "conditions" ? collectionSchema(page.path, copy.title, conditionBreadcrumbs(undefined, page.category), page.index[page.category].map(row => ({ name: row.label, path: row.path }))) : page.kind === "directory" ? collectionSchema(page.path, copy.title, [{ name: "ホーム", path: "/" }, { name: "キャラ一覧", path: "/brawlers" }], page.entries.map(row => ({ name: row.nameJa, path: `/brawlers/${row.slug}` }))) : breadcrumb
  let structured: { "@context": string; "@graph": unknown[] } = general ? { "@context": "https://schema.org", "@graph": [...siteNodes(), ...generalNodes(page, url, copy.title)] } : pageSchema(page as import("@/lib/llm-data").PublicPage, schema, true)
  // FAQ goes last so the character entity stays the first top-level Thing.
  if (page.kind === "detail") { const faq = faqNode(url, brawlerFaq(page.data)); if (faq) structured = { ...structured, "@graph": [...structured["@graph"], faq] } }
  const dataLinks = general ? "" : `<link rel="alternate" type="application/json" href="${SITE_URL}${dataPath(page.path)}"><link rel="describedby" type="application/json" href="${SITE_URL}/data/index.json"><link rel="describedby" type="application/ld+json" href="${SITE_URL}/data/catalog.jsonld">`
  const robots = index ? "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" : "noindex, follow"
  const image = `<meta property="og:image" content="${SITE_URL}/icon-512.png"><meta property="og:image:width" content="512"><meta property="og:image:height" content="512"><meta property="og:image:alt" content="ブロラボ">`
  return `<!DOCTYPE html><html lang="ja" class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${shell.links}<link rel="manifest" href="/manifest.json"><meta name="theme-color" content="#10182c"><link rel="preconnect" href="https://cdn.brawlify.com" crossorigin><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${escapeHtml(url)}">${dataLinks}<meta name="robots" content="${robots}"><meta property="og:type" content="website"><meta property="og:locale" content="ja_JP"><meta property="og:site_name" content="ブロラボ"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(url)}">${image}<meta name="twitter:card" content="summary"><meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description)}"><meta name="twitter:image" content="${SITE_URL}/icon-512.png"><meta name="twitter:image:alt" content="ブロラボ"><script type="application/ld+json">${safeJson(structured)}</script></head><body class="${shell.bodyClass}"><div id="brawler-runtime">${renderToString(<App page={page} />)}</div><script id="brawler-page-data" type="application/json">${safeJson(page)}</script><script type="module" src="${shell.client}"></script></body></html>`
}

export const runtimeVersion = shell.version
