import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { build } from "esbuild"
import { fileURLToPath } from "node:url"

const libOut = await build({
  entryPoints: ["src/lib/contact.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
})
const {
  validateContactInput,
  escapeSheetFormula,
  sanitizePagePath,
  CONTACT_LIMITS,
} = await import(`data:text/javascript;base64,${Buffer.from(libOut.outputFiles[0].contents).toString("base64")}`)

// --- Unit tests: validation, boundaries, and formula escaping ---
assert.equal(escapeSheetFormula("=SUM(A1:A2)"), "'=SUM(A1:A2)")
assert.equal(escapeSheetFormula("+cmd|' /C calc'!A0"), "'+cmd|' /C calc'!A0")
assert.equal(escapeSheetFormula("-1+1"), "'-1+1")
assert.equal(escapeSheetFormula("@user"), "'@user")
assert.equal(escapeSheetFormula("\t=1"), "'\t=1")
assert.equal(escapeSheetFormula("普通のテキスト"), "普通のテキスト")
assert.equal(escapeSheetFormula(""), "")

assert.equal(sanitizePagePath("/tier?tab=gachi"), "/tier?tab=gachi")
assert.equal(sanitizePagePath("https://brawl-lab.sozai-hub.com/brawlers/amber"), "https://brawl-lab.sozai-hub.com/brawlers/amber")
assert.equal(sanitizePagePath("javascript:alert(1)"), "")
assert.equal(sanitizePagePath("//evil.example/path"), "")

const validFeature = validateContactInput({
  category: "feature",
  subject: "",
  message: "マップ別ランキングに検索バーを追加してほしいです。",
  pageUrl: "/maps",
  replyContact: "@burolabo_fan",
  website: "",
})
assert.equal(validFeature.ok, true)
assert.equal(validFeature.honeypot, false)
assert.equal(validFeature.data.categoryLabel, "機能要望")
assert.equal(validFeature.data.priority, "中")
assert.equal(validFeature.data.subject, "マップ別ランキングに検索バーを追加してほしいです。")

const validBug = validateContactInput({
  category: "bug",
  subject: "スマホで崩れる",
  message: "12345",
  replyContact: "user@example.com",
})
assert.equal(validBug.ok, true)
assert.equal(validBug.data.priority, "高")

const invalidEmpty = validateContactInput({ category: "invalid", message: "   " })
assert.equal(invalidEmpty.ok, false)
assert.ok(invalidEmpty.errors.category)
assert.ok(invalidEmpty.errors.message)

const invalidBounds = validateContactInput({
  category: "other",
  subject: "a".repeat(CONTACT_LIMITS.subjectMax + 1),
  message: "a".repeat(CONTACT_LIMITS.messageMax + 1),
  pageUrl: "javascript:void(0)",
  replyContact: "not-an-email@invalid",
})
assert.equal(invalidBounds.ok, false)
assert.ok(invalidBounds.errors.subject)
assert.ok(invalidBounds.errors.message)
assert.ok(invalidBounds.errors.pageUrl)
assert.ok(invalidBounds.errors.replyContact)

const shortMessage = validateContactInput({ category: "data", message: "1234" })
assert.equal(shortMessage.ok, false)
assert.ok(shortMessage.errors.message)

// --- Worker integration tests: /contact page and POST /api/contact ---
const workerOut = await build({
  entryPoints: ["edge/worker.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  jsx: "automatic",
  tsconfig: "tsconfig.json",
  write: false,
  alias: Object.fromEntries(["link", "image", "navigation"].map((name) => [
    `next/${name}`,
    fileURLToPath(new URL(`../edge/${name}.tsx`, import.meta.url)),
  ])),
  define: { "process.env.NODE_ENV": '"production"' },
})
const { default: worker } = await import(
  `data:text/javascript;base64,${Buffer.from(workerOut.outputFiles[0].contents).toString("base64")}`
)

const originalFetch = globalThis.fetch
const originalCaches = globalThis.caches
const cacheStores = new Map()
globalThis.caches = {
  open: async (name) => {
    if (!cacheStores.has(name)) cacheStores.set(name, new Map())
    const store = cacheStores.get(name)
    return {
      match: async (req) => store.get(req.url)?.clone(),
      put: async (req, res) => { store.set(req.url, res.clone()) },
    }
  },
}

let webhookCalls = []
let webhookMode = "ok"
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  if (url === "https://script.google.com/macros/s/test/exec") {
    webhookCalls.push(JSON.parse(init.body))
    if (webhookMode === "http-error") return new Response("error", { status: 500 })
    if (webhookMode === "app-error") return Response.json({ ok: false, error: "unauthorized" })
    return Response.json({ ok: true, id: `BL-000${webhookCalls.length}` })
  }
  throw new Error(`Unexpected fetch to ${url}`)
}

const env = {
  NEXT_PUBLIC_API_URL: "https://test-statistics.example",
  CONTACT_WEBHOOK_URL: "https://script.google.com/macros/s/test/exec",
  CONTACT_WEBHOOK_SECRET: "super-secret-token",
  ASSETS: {
    fetch: async (req) => {
      try {
        return new Response(await readFile(`out${new URL(req.url).pathname}`))
      } catch {
        return new Response("not found", { status: 404 })
      }
    },
  },
}
const ctx = { waitUntil: () => {} }

const postContact = (body, headers = {}, customEnv = env) =>
  worker.fetch(
    new Request("https://brawl-lab.sozai-hub.com/api/contact", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://brawl-lab.sozai-hub.com",
        "CF-Connecting-IP": "203.0.113.10",
        ...headers,
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    customEnv,
    ctx,
  )

try {
  // GET /contact renders ContactPage with header + footer links
  const pageRes = await worker.fetch(new Request("https://brawl-lab.sozai-hub.com/contact"), env, ctx)
  assert.equal(pageRes.status, 200)
  const pageHtml = await pageRes.text()
  assert.match(pageHtml, /お問い合わせ・ご要望/)
  assert.match(pageHtml, /ContactPage/)
  assert.match(pageHtml, /href="\/contact"/)
  assert.match(pageHtml, /"kind":"contact"/)
  assert.equal((await worker.fetch(new Request("https://brawl-lab.sozai-hub.com/contact/"), env, ctx)).status, 308)
  assert.equal((await worker.fetch(new Request("https://brawl-lab.sozai-hub.com/contact", { method: "HEAD" }), env, ctx)).status, 200)
  assert.equal((await worker.fetch(new Request("https://brawl-lab.sozai-hub.com/contact", { method: "POST" }), env, ctx)).status, 405)

  // /api/contact method, origin, content-type, malformed JSON, validation checks
  assert.equal((await worker.fetch(new Request("https://brawl-lab.sozai-hub.com/api/contact", { method: "GET" }), env, ctx)).status, 405)
  assert.equal((await postContact({ category: "bug", message: "テストメッセージです" }, { Origin: "https://evil.example" })).status, 403)
  assert.equal((await postContact("{bad json")).status, 400)
  assert.equal((await postContact({ category: "bug", message: "短い" })).status, 400)

  // Honeypot silently succeeds without calling webhook
  const honeyRes = await postContact({
    category: "feature",
    message: "これはスパムボットの投稿テストです",
    website: "https://spam.example",
  })
  assert.equal(honeyRes.status, 200)
  assert.equal(webhookCalls.length, 0)

  // Happy path + formula injection neutralization
  const okRes = await postContact({
    category: "bug",
    subject: "=HYPERLINK(\"http://evil\")",
    message: "+1+1 表示が崩れています",
    pageUrl: "/tier",
    replyContact: "@player_tag",
    clientInfo: "Desktop / Windows / Chrome",
  })
  assert.equal(okRes.status, 200)
  const okJson = await okRes.json()
  assert.equal(okJson.ok, true)
  assert.equal(okJson.id, "BL-0001")
  assert.equal(webhookCalls.length, 1)
  assert.equal(webhookCalls[0].secret, "super-secret-token")
  assert.equal(webhookCalls[0].priority, "高")
  assert.equal(webhookCalls[0].subject, "'=HYPERLINK(\"http://evil\")")
  assert.equal(webhookCalls[0].message, "'+1+1 表示が崩れています")
  assert.equal(webhookCalls[0].replyContact, "'@player_tag")

  // Unconfigured webhook -> 503
  const unconfigured = await postContact(
    { category: "other", message: "設定確認のテストメッセージ" },
    { "CF-Connecting-IP": "203.0.113.11" },
    { ...env, CONTACT_WEBHOOK_URL: "", CONTACT_WEBHOOK_SECRET: "" },
  )
  assert.equal(unconfigured.status, 503)

  // Upstream failure -> 502
  webhookMode = "http-error"
  const errRes = await postContact(
    { category: "other", message: "上流エラー時のハンドリングテスト" },
    { "CF-Connecting-IP": "203.0.113.12" },
  )
  assert.equal(errRes.status, 502)
  webhookMode = "ok"

  // Rate limit: IP 203.0.113.20 allows 5 requests then returns 429 on 6th
  for (let i = 0; i < 5; i++) {
    const res = await postContact(
      { category: "feature", message: `レート制限確認テスト #${i + 1}` },
      { "CF-Connecting-IP": "203.0.113.20" },
    )
    assert.equal(res.status, 200)
  }
  const limitedRes = await postContact(
    { category: "feature", message: "レート制限超過の確認テスト" },
    { "CF-Connecting-IP": "203.0.113.20" },
  )
  assert.equal(limitedRes.status, 429)
  assert.ok(limitedRes.headers.get("Retry-After"))

  console.log("PASS: contact form validation, formula escaping, /contact SSR, /api/contact security, honeypot, rate-limit, and error handling")
} finally {
  globalThis.fetch = originalFetch
  globalThis.caches = originalCaches
}
process.exit(0)
