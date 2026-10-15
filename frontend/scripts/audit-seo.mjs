import { writeFile, mkdir } from "node:fs/promises"

const origin = new URL(process.argv[2] || "https://brawl-lab.sozai-hub.com").origin
const output = process.argv[3] || ".seo-data/seo-audit.json"
const sitemap = await (await fetch(`${origin}/sitemap.xml`, { signal: AbortSignal.timeout(60000) })).text()
const paths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => new URL(url).pathname)
if (!paths.length || new Set(paths).size !== paths.length) throw new Error("Empty or duplicate sitemap")
const records = [], queue = [...paths], linked = new Set()
const attr = (html, tag, key, value, wanted) => html.match(new RegExp(`<${tag}\\b(?=[^>]*\\b${key}=["']${value}["'])[^>]*\\b${wanted}=["']([^"']+)["']`, "i"))?.[1] || null
async function inspect(path) {
  const started = performance.now()
  try {
    const response = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(60000) })
    const html = await response.text()
    const links = [...html.matchAll(/<a\b[^>]*href="([^"#?]+)[^" ]*"/g)].flatMap(([, href]) => {
      try { const u = new URL(href, origin); return u.origin === origin && !u.pathname.startsWith("/_next/") ? [u.pathname] : [] } catch { return [] }
    })
    links.forEach(href => linked.add(href))
    const record = { path, status: response.status, finalPath: new URL(response.url).pathname, ms: Math.round(performance.now() - started), title: html.match(/<title>([^<]+)<\/title>/)?.[1] || null,
      canonical: attr(html, "link", "rel", "canonical", "href"), robots: attr(html, "meta", "name", "robots", "content"), rendering: response.headers.get("X-Brawler-Rendering"),
      h1: html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1]?.replace(/<[^>]+>/g, "") || null,
      dates: [...new Set([...html.matchAll(/<time\b[^>]*dateTime="([^"]+)"/gi)].map(match => match[1]))], links: [...new Set(links)] }
    records.push(record)
  } catch (error) { records.push({ path, error: error.message }) }
}
const consume = async () => { while (queue.length) await inspect(queue.shift()) }
await Promise.all([consume(), consume()])
const extra = [...linked].filter(path => !paths.includes(path) && !path.startsWith("/data/"))
for (const path of extra) {
  try { const response = await fetch(`${origin}${path}`, { method: "HEAD", signal: AbortSignal.timeout(60000) }); records.push({ path, linkedOnly: true, status: response.status, finalPath: new URL(response.url).pathname }) }
  catch (error) { records.push({ path, linkedOnly: true, error: error.message }) }
}
const titles = new Map()
for (const record of records.filter(row => row.title)) titles.set(record.title, [...(titles.get(record.title) || []), record.path])
const issues = records.flatMap(row => {
  if (row.error || row.status !== 200) return [{ path: row.path, reason: row.error || `HTTP ${row.status}` }]
  if (row.linkedOnly) return []
  return [!row.title && "missing title", !row.h1 && "missing h1", (!row.canonical || new URL(row.canonical).href !== new URL(`https://brawl-lab.sozai-hub.com${row.path}`).href) && "canonical mismatch", /noindex/i.test(row.robots || "") && "noindex in sitemap"].filter(Boolean).map(reason => ({ path: row.path, reason }))
})
const report = { checkedAt: new Date().toISOString(), origin, sitemapCount: paths.length, linkedOnlyCount: extra.length, issues, duplicateTitles: [...titles].filter(([, urls]) => urls.length > 1), records }
await mkdir(output.replace(/[/\\][^/\\]+$/, ""), { recursive: true })
await writeFile(output, JSON.stringify(report, null, 2))
console.log(JSON.stringify({ output, sitemapCount: paths.length, linkedOnlyCount: extra.length, issues, duplicateTitles: report.duplicateTitles }))
if (issues.length || report.duplicateTitles.length) process.exitCode = 1
