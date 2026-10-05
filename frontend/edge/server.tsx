import { renderToString } from "react-dom/server.browser"
import { App, type RuntimePage } from "./app"
import { SITE_URL, searchCopy, brawlerSearchCopy } from "@/lib/seo"
import shell from "./generated-shell.json"
import { collectionSchema, conditionSchema, conditionCopy, conditionBreadcrumbs } from "@/lib/condition-pages"

export const escapeHtml = (text: string) => text.replace(/[&<>"']/g, value => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[value]!)
const safeJson = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c")

export function renderPage(page: RuntimePage) {
  const isDetail = page.kind === "detail"
  const name = isDetail ? page.data.nameJa : ""
  const copy = isDetail ? brawlerSearchCopy(name) : page.kind === "condition" ? conditionCopy(page.data.entry) : page.kind === "conditions" ? { title: `ブロスタ ${page.category === "modes" ? "モード" : "マップ"}別最強キャラランキング`, description: `${page.category === "modes" ? "モード" : "マップ"}別のキャラ勝率・使用率ランキング。` } : searchCopy.brawlers
  const title = `${copy.title} | ブロラボ`
  const description = copy.description
  const index = page.kind === "detail" ? Object.values(page.data.cohorts).some(cohort => cohort.stats?.sample_sufficient) : page.kind === "condition" ? Object.values(page.data.cohorts).some(cohort => cohort.rows.some(row => row.sample_sufficient)) : true
  const url = `${SITE_URL}${page.path}`
  const breadcrumb = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
    { "@type": "ListItem", position: 1, name: "ホーム", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "キャラ一覧", item: `${SITE_URL}/brawlers` },
    ...(isDetail ? [{ "@type": "ListItem", position: 3, name, item: url }] : []),
  ] }
  const schema = page.kind === "condition" ? conditionSchema(page.data) : page.kind === "conditions" ? collectionSchema(page.path, copy.title, conditionBreadcrumbs(undefined, page.category), page.index[page.category].map(row => ({ name: row.label, path: row.path }))) : page.kind === "directory" ? collectionSchema(page.path, copy.title, [{ name: "ホーム", path: "/" }, { name: "キャラ一覧", path: "/brawlers" }], page.entries.map(row => ({ name: row.nameJa, path: `/brawlers/${row.slug}` }))) : breadcrumb
  return `<!DOCTYPE html><html lang="ja" class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${shell.links}<title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${escapeHtml(url)}"><meta name="robots" content="${index ? "index" : "noindex"}, follow"><meta property="og:type" content="website"><meta property="og:locale" content="ja_JP"><meta property="og:site_name" content="ブロラボ"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(url)}"><meta property="og:image" content="${SITE_URL}/icon-512.png"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description)}"><meta name="twitter:image" content="${SITE_URL}/icon-512.png"><script type="application/ld+json">${safeJson(schema)}</script></head><body class="${shell.bodyClass}"><div id="brawler-runtime">${renderToString(<App page={page} />)}</div><script id="brawler-page-data" type="application/json">${safeJson(page)}</script><script type="module" src="${shell.client}"></script></body></html>`
}

export const runtimeVersion = shell.version
