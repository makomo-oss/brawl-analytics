import { build } from "esbuild"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { resolve } from "node:path"
import { createHash } from "node:crypto"

const root = process.cwd()
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
const sources = await Promise.all(["edge/server.tsx", "edge/worker.ts", "src/lib/brawler-page-data.ts"].map(path => readFile(resolve(root, path), "utf8")))
await mkdir(resolve(root, "edge"), { recursive: true })
await writeFile(resolve(root, "edge/generated-shell.json"), JSON.stringify({ links, bodyClass, client: clientPath, version: hash(output.toString() + sources.join("") + links + bodyClass) }))
await build({ ...common, entryPoints: ["edge/worker.ts"], outfile: "out/_worker.js" })
await writeFile(resolve(root, "out/_routes.json"), JSON.stringify({ version: 1, include: ["/brawlers", "/brawlers/*", "/sitemap.xml"], exclude: [] }))
console.log(`Live character pages built: ${clientPath}`)
