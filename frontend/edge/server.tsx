import { renderToString } from "react-dom/server.browser"
import { App, type RuntimePage } from "./app"
import { SITE_URL } from "@/lib/seo"
import shell from "./generated-shell.json"

export const escapeHtml = (text: string) => text.replace(/[&<>"']/g, value => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[value]!)
const safeJson = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c")

export function renderPage(page: RuntimePage) {
  const isDetail = page.kind === "detail"
  const name = isDetail ? page.data.nameJa : ""
  const title = isDetail ? `ブロスタ ${name}の勝率・相性・おすすめマップ | ブロラボ` : "ブロスタ キャラ一覧・勝率と相性 | ブロラボ"
  const description = isDetail ? `${name}のTier・勝率・使用率を対戦データから分析。モード別の成績、おすすめマップ、有利・不利な敵キャラ、相性のよい味方を集計件数とともに確認できます。` : "ブロスタのキャラ別Tier・勝率・使用率・おすすめマップ・敵味方との相性を対戦データで確認。各キャラの分析ページを一覧から探せます。"
  const index = !isDetail || Object.values(page.data.cohorts).some(cohort => cohort.stats?.sample_sufficient)
  const url = `${SITE_URL}${page.path}`
  const breadcrumb = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
    { "@type": "ListItem", position: 1, name: "ホーム", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "キャラ一覧", item: `${SITE_URL}/brawlers` },
    ...(isDetail ? [{ "@type": "ListItem", position: 3, name, item: url }] : []),
  ] }
  return `<!DOCTYPE html><html lang="ja" class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${shell.links}<title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${escapeHtml(url)}"><meta name="robots" content="${index ? "index" : "noindex"}, follow"><meta property="og:type" content="website"><meta property="og:locale" content="ja_JP"><meta property="og:site_name" content="ブロラボ"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(url)}"><meta property="og:image" content="${SITE_URL}/icon-512.png"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description)}"><meta name="twitter:image" content="${SITE_URL}/icon-512.png"><script type="application/ld+json">${safeJson(breadcrumb)}</script></head><body class="${shell.bodyClass}"><div id="brawler-runtime">${renderToString(<App page={page} />)}</div><script id="brawler-page-data" type="application/json">${safeJson(page)}</script><script type="module" src="${shell.client}"></script></body></html>`
}

export const runtimeVersion = shell.version
