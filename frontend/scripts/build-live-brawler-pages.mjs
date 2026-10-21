import { build } from "esbuild"
import { readFile, writeFile, mkdir, rm } from "node:fs/promises"
import { resolve } from "node:path"
import { createHash } from "node:crypto"

const root = process.cwd()
// Next's export can retain directories that this script generated previously.
// Remove only our generated assets so retired/low-sample URLs cannot reuse them.
for (const name of ["__overview-snapshots", "__brawler-snapshots", "__condition-snapshots", "__rendered-pages", "data"]) {
  const target = resolve(root, "out", name)
  if (!target.startsWith(resolve(root, "out") + (process.platform === "win32" ? "\\" : "/"))) throw new Error("Invalid generated asset directory")
  await rm(target, { recursive: true, force: true })
}
const llmModule = await build({ entryPoints: ["src/lib/llm-data.ts"], bundle: true, format: "esm", platform: "node", write: false })
const { publicData, publicCatalog, dataPath } = await import(`data:text/javascript;base64,${Buffer.from(llmModule.outputFiles[0].contents).toString("base64")}`)
async function writeData(page) {
  const path = dataPath(page.path)
  await mkdir(resolve(root, `out${path.slice(0, path.lastIndexOf("/"))}`), { recursive: true })
  await writeFile(resolve(root, `out${path}`), JSON.stringify(publicData(page)))
}
// Ship bounded per-character snapshots for an immediate first response while
// the Worker refreshes live data. Newly discovered URLs still resolve via API.
const snapshot = JSON.parse(await readFile(resolve(root, ".seo-data/brawler-pages.json"), "utf8"))
const overviewDir = resolve(root, "out/__overview-snapshots")
await mkdir(overviewDir, { recursive: true })
for (const [kind, type] of [["home", "gachi"], ["tier", "global"]]) {
  const rows = cohort => Object.fromEntries(Object.entries(snapshot.details[cohort]).map(([name, detail]) => [name, {
    kamo: detail.kamo, tenteki: detail.tenteki, kamo_scope: detail.kamo_scope, tenteki_scope: detail.tenteki_scope,
  }]))
  const initialMatchups = { global: kind === "tier" ? rows("global") : {}, gachi: rows("gachi") }
  await writeFile(resolve(overviewDir, `${kind}.json`), JSON.stringify({ kind, path: kind === "home" ? "/" : "/tier", tierData: snapshot.overview[type], initialMatchups }))
}
const snapshotDir = resolve(root, "out/__brawler-snapshots")
await mkdir(snapshotDir, { recursive: true })
const compact = name => ({ ...snapshot,
  details: Object.fromEntries(["global", "gachi"].map(type => [type, name ? { [name]: snapshot.details[type][name] } : {}])),
  contexts: Object.fromEntries(["global", "gachi"].map(type => [type, Object.fromEntries(["modes", "maps"].map(kind => [kind, name ? Object.fromEntries(Object.entries(snapshot.contexts[type][kind]).map(([id, rows]) => [id, rows[name] ? { [name]: rows[name] } : {}])) : {}]))])),
})
await writeFile(resolve(snapshotDir, "index.json"), JSON.stringify(compact()))
const dataModule = await build({ entryPoints: ["src/lib/brawler-page-data.ts"], bundle: true, format: "esm", platform: "node", write: false })
const { brawlerEntries, brawlerPage } = await import(`data:text/javascript;base64,${Buffer.from(dataModule.outputFiles[0].contents).toString("base64")}`)
const directories = [{ kind: "directory", path: "/brawlers", entries: brawlerEntries(snapshot) }]
await writeData(directories[0])
for (const { name, slug } of brawlerEntries(snapshot)) {
  await writeFile(resolve(snapshotDir, `${slug}.json`), JSON.stringify(compact(name)))
  await writeData({ kind: "detail", path: `/brawlers/${slug}`, data: brawlerPage(snapshot, slug) })
}
const conditionModule = await build({ entryPoints: ["src/lib/condition-pages.ts"], bundle: true, format: "esm", platform: "node", write: false })
const { conditionIndex, conditionPage } = await import(`data:text/javascript;base64,${Buffer.from(conditionModule.outputFiles[0].contents).toString("base64")}`)
const conditionDirectory = conditionIndex(snapshot)
const conditionDir = resolve(root, "out/__condition-snapshots")
await mkdir(conditionDir, { recursive: true })
await writeFile(resolve(conditionDir, "index.json"), JSON.stringify(conditionDirectory))
for (const category of ["modes", "maps"]) {
  await mkdir(resolve(conditionDir, category), { recursive: true })
  const directory = { kind: "conditions", path: `/${category}`, category, index: conditionDirectory }
  directories.push(directory)
  await writeFile(resolve(conditionDir, `${category}.json`), JSON.stringify(directory))
  await writeData(directory)
  for (const entry of conditionDirectory[category]) {
    const page = { kind: "condition", path: entry.path, data: conditionPage(snapshot, entry, conditionDirectory) }
    await writeFile(resolve(conditionDir, `${category}/${entry.slug}.json`), JSON.stringify(page))
    await writeData(page)
  }
}
await writeFile(resolve(root, "out/data/index.json"), JSON.stringify(publicCatalog(directories)))
await writeFile(resolve(root, "out/data/catalog.jsonld"), JSON.stringify(publicCatalog(directories).schema))
const hash = value => createHash("sha256").update(value).digest("hex").slice(0, 16)
const common = {
  bundle: true, minify: true, format: "esm", platform: "browser", jsx: "automatic",
  tsconfig: resolve(root, "tsconfig.json"),
  alias: Object.fromEntries(["link", "image", "navigation"].map(name => [`next/${name}`, resolve(root, `edge/${name}.tsx`)])),
  define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_API_URL": JSON.stringify(process.env.NEXT_PUBLIC_API_URL || "https://brawl-analytics-s000.onrender.com") },
}
const client = await build({ ...common, entryPoints: ["edge/client.tsx"], write: false })
const output = client.outputFiles[0].contents
const clientPath = `/brawler-runtime-${hash(output)}.js`
await writeFile(resolve(root, `out${clientPath}`), output)

// Reuse Next's generated font and stylesheet references; never ship its RSC
// payload on pages rendered by the separate Pages runtime.
const html = await readFile(resolve(root, "out/brawlers.html"), "utf8")
const links = [...html.matchAll(/<link\b[^>]*>/g)].map(match => match[0]).filter(link =>
  /rel="(?:stylesheet|icon|apple-touch-icon|shortcut icon)"/.test(link) || /as="font"/.test(link)).join("")
const bodyClass = html.match(/<body class="([^"]*)"/)?.[1]
if (!links.includes('rel="stylesheet"') || !bodyClass) throw new Error("Could not find the existing app stylesheet or font")
const sources = await Promise.all(["edge/server.tsx", "edge/worker.ts", "edge/public-data.ts", "src/lib/llm-data.ts", "src/lib/site-schema.ts", "src/lib/brawler-page-data.ts", "src/lib/condition-pages.ts", "src/lib/seo.ts"].map(path => readFile(resolve(root, path), "utf8")))
await mkdir(resolve(root, "edge"), { recursive: true })
await writeFile(resolve(root, "edge/generated-shell.json"), JSON.stringify({ links, bodyClass, client: clientPath, version: hash(output.toString() + sources.join("") + links + bodyClass) }))
// Pre-render the cold-start fallback using exactly the live renderer/payload.
// Serving these bytes does not consume the edge CPU budget for a second SSR.
const renderer = await build({ ...common, entryPoints: ["edge/server.tsx"], write: false })
const { renderPage } = await import(`data:text/javascript;base64,${Buffer.from(renderer.outputFiles[0].contents).toString("base64")}`)
async function writeDocument(page) {
  const path = resolve(root, `out/__rendered-pages${page.path === "/" ? "/index" : page.path}.document`)
  await mkdir(resolve(path, ".."), { recursive: true })
  await writeFile(path, renderPage(page))
}
for (const page of directories) await writeDocument(page)
for (const { slug } of brawlerEntries(snapshot)) await writeDocument({ kind: "detail", path: `/brawlers/${slug}`, data: brawlerPage(snapshot, slug) })
for (const category of ["modes", "maps"]) for (const entry of conditionDirectory[category]) await writeDocument({ kind: "condition", path: entry.path, data: conditionPage(snapshot, entry, conditionDirectory) })
for (const kind of ["home", "tier"]) await writeDocument(JSON.parse(await readFile(resolve(overviewDir, `${kind}.json`), "utf8")))
for (const kind of ["player", "companion"]) await writeDocument({ kind, path: `/${kind}` })
await build({ ...common, entryPoints: ["edge/worker.ts"], outfile: "out/_worker.js" })
await writeFile(resolve(root, "out/_routes.json"), JSON.stringify({ version: 1, include: ["/", "/tier", "/player", "/player/", "/companion", "/companion/", "/brawlers", "/brawlers/*", "/modes", "/modes/*", "/maps", "/maps/*", "/data/*", "/sitemap.xml"], exclude: [] }))
console.log(`Live character pages built: ${clientPath}`)
// Browser-oriented React UI dependencies may keep MessageChannels open in Node.
// Every build/write above is awaited; this command has no remaining work.
process.exit(0)
