import { build } from "esbuild"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { resolve } from "node:path"
import { createHash } from "node:crypto"

const root = process.cwd()
// Ship bounded per-character snapshots for an immediate first response while
// the Worker refreshes live data. Newly discovered URLs still resolve via API.
const snapshot = JSON.parse(await readFile(resolve(root, ".seo-data/brawler-pages.json"), "utf8"))
const snapshotDir = resolve(root, "out/__brawler-snapshots")
await mkdir(snapshotDir, { recursive: true })
const compact = name => ({ ...snapshot,
  details: Object.fromEntries(["global", "gachi"].map(type => [type, name ? { [name]: snapshot.details[type][name] } : {}])),
  contexts: Object.fromEntries(["global", "gachi"].map(type => [type, Object.fromEntries(["modes", "maps"].map(kind => [kind, name ? Object.fromEntries(Object.entries(snapshot.contexts[type][kind]).map(([id, rows]) => [id, rows[name] ? { [name]: rows[name] } : {}])) : {}]))])),
})
await writeFile(resolve(snapshotDir, "index.json"), JSON.stringify(compact()))
const dataModule = await build({ entryPoints: ["src/lib/brawler-page-data.ts"], bundle: true, format: "esm", platform: "node", write: false })
const { brawlerEntries } = await import(`data:text/javascript;base64,${Buffer.from(dataModule.outputFiles[0].contents).toString("base64")}`)
for (const { name, slug } of brawlerEntries(snapshot)) {
  await writeFile(resolve(snapshotDir, `${slug}.json`), JSON.stringify(compact(name)))
}
const conditionModule = await build({ entryPoints: ["src/lib/condition-pages.ts"], bundle: true, format: "esm", platform: "node", write: false })
const { conditionIndex, conditionPage } = await import(`data:text/javascript;base64,${Buffer.from(conditionModule.outputFiles[0].contents).toString("base64")}`)
const conditionDirectory = conditionIndex(snapshot)
const conditionDir = resolve(root, "out/__condition-snapshots")
await mkdir(conditionDir, { recursive: true })
await writeFile(resolve(conditionDir, "index.json"), JSON.stringify(conditionDirectory))
for (const category of ["modes", "maps"]) {
  await mkdir(resolve(conditionDir, category), { recursive: true })
  await writeFile(resolve(conditionDir, `${category}.json`), JSON.stringify({ kind: "conditions", path: `/${category}`, category, index: conditionDirectory }))
  for (const entry of conditionDirectory[category]) await writeFile(resolve(conditionDir, `${category}/${entry.slug}.json`), JSON.stringify({ kind: "condition", path: entry.path, data: conditionPage(snapshot, entry, conditionDirectory) }))
}
const hash = value => createHash("sha256").update(value).digest("hex").slice(0, 16)
const common = {
  bundle: true, minify: true, format: "esm", platform: "browser", jsx: "automatic",
  tsconfig: resolve(root, "tsconfig.json"),
  alias: Object.fromEntries(["link", "image", "navigation"].map(name => [`next/${name}`, resolve(root, `edge/${name}.tsx`)])),
  define: { "process.env.NODE_ENV": '"production"' },
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
const sources = await Promise.all(["edge/server.tsx", "edge/worker.ts", "src/lib/brawler-page-data.ts", "src/lib/condition-pages.ts", "src/lib/seo.ts"].map(path => readFile(resolve(root, path), "utf8")))
await mkdir(resolve(root, "edge"), { recursive: true })
await writeFile(resolve(root, "edge/generated-shell.json"), JSON.stringify({ links, bodyClass, client: clientPath, version: hash(output.toString() + sources.join("") + links + bodyClass) }))
await build({ ...common, entryPoints: ["edge/worker.ts"], outfile: "out/_worker.js" })
await writeFile(resolve(root, "out/_routes.json"), JSON.stringify({ version: 1, include: ["/brawlers", "/brawlers/*", "/modes", "/modes/*", "/maps", "/maps/*", "/sitemap.xml"], exclude: [] }))
console.log(`Live character pages built: ${clientPath}`)
