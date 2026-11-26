import { escapeSheetFormula, validateContactInput, type ContactSubmissionInput } from "@/lib/contact"
import { SITE_URL } from "@/lib/seo"

export type ContactEnv = Env & {
  CONTACT_WEBHOOK_URL?: string
  CONTACT_WEBHOOK_SECRET?: string
}

const MAX_BODY_BYTES = 16 * 1024
const RATE_LIMIT_WINDOW_SECONDS = 600
const RATE_LIMIT_MAX_REQUESTS = 5

function json(body: Record<string, unknown>, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
      ...extraHeaders,
    },
  })
}

function isAllowedOrigin(request: Request, requestOrigin: string): boolean {
  const origin = request.headers.get("Origin")
  if (origin) {
    if (origin === requestOrigin || origin === SITE_URL) return true
    try {
      const parsed = new URL(origin)
      if (parsed.protocol === "https:" && parsed.hostname.endsWith(".pages.dev")) return true
      if (parsed.protocol === "http:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")) return true
    } catch {
      return false
    }
    return false
  }
  const secFetchSite = request.headers.get("Sec-Fetch-Site")
  return secFetchSite === "same-origin"
}

async function readBoundedJson(request: Request): Promise<{ ok: true; data: ContactSubmissionInput } | { ok: false; status: number; error: string }> {
  const contentType = request.headers.get("Content-Type") || ""
  if (!contentType.toLowerCase().includes("application/json")) {
    return { ok: false, status: 415, error: "JSON形式で送信してください。" }
  }
  if (!request.body) {
    return { ok: false, status: 400, error: "送信データが空です。" }
  }
  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let text = ""
  let bytes = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > MAX_BODY_BYTES) {
        return { ok: false, status: 413, error: "送信データが大きすぎます。" }
      }
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
  } finally {
    await reader.cancel().catch(() => {})
  }
  try {
    const parsed: unknown = JSON.parse(text)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, status: 400, error: "送信データの形式が正しくありません。" }
    }
    return { ok: true, data: parsed as ContactSubmissionInput }
  } catch {
    return { ok: false, status: 400, error: "送信データの解析に失敗しました。" }
  }
}

async function checkRateLimit(request: Request, origin: string): Promise<{ allowed: boolean; retryAfter: number }> {
  const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() || "unknown"
  const windowBucket = Math.floor(Date.now() / (RATE_LIMIT_WINDOW_SECONDS * 1000))
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`contact:${windowBucket}:${ip}`))
  const keyHash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")
  const cache = await caches.open("contact-rate-limit")
  const cacheKey = new Request(`${origin}/__contact-rl/${windowBucket}/${keyHash}`)

  const existing = await cache.match(cacheKey)
  let count = 0
  if (existing) {
    const parsed = Number(await existing.text())
    if (Number.isFinite(parsed) && parsed > 0) count = parsed
  }

  const nextWindowStart = (windowBucket + 1) * RATE_LIMIT_WINDOW_SECONDS
  const retryAfter = Math.max(1, nextWindowStart - Math.floor(Date.now() / 1000))
  if (count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, retryAfter }
  }

  await cache
    .put(
      cacheKey,
      new Response(String(count + 1), {
        headers: { "Cache-Control": `public, max-age=${RATE_LIMIT_WINDOW_SECONDS}` },
      }),
    )
    .catch((err: unknown) => console.error("Contact rate-limit write failed", String(err)))

  return { allowed: true, retryAfter: 0 }
}

export async function handleContactRequest(request: Request, env: ContactEnv): Promise<Response> {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405, { Allow: "POST" })
  }

  const requestOrigin = new URL(request.url).origin
  if (!isAllowedOrigin(request, requestOrigin)) {
    return json({ ok: false, error: "不正な送信元からのリクエストです。" }, 403)
  }

  const parsedBody = await readBoundedJson(request)
  if (!parsedBody.ok) {
    return json({ ok: false, error: parsedBody.error }, parsedBody.status)
  }

  const validated = validateContactInput(parsedBody.data)
  if (!validated.ok) {
    return json(
      { ok: false, error: "入力内容を確認してください。", errors: validated.errors },
      400,
    )
  }

  // Silently accept honeypot submissions so spam bots do not retry or adapt.
  if (validated.honeypot) {
    return json({ ok: true, id: "BL-0000" }, 200)
  }

  const rate = await checkRateLimit(request, requestOrigin)
  if (!rate.allowed) {
    return json(
      { ok: false, error: "送信回数が上限に達しました。しばらく時間をおいてから再度お試しください。" },
      429,
      { "Retry-After": String(rate.retryAfter) },
    )
  }

  const webhookUrl = (env.CONTACT_WEBHOOK_URL || "").trim()
  const webhookSecret = (env.CONTACT_WEBHOOK_SECRET || "").trim()
  if (!webhookUrl || !webhookSecret) {
    return json(
      { ok: false, error: "現在お問い合わせフォームの受付準備中です。しばらく時間をおいてお試しください。" },
      503,
    )
  }

  let targetUrl: URL
  try {
    targetUrl = new URL(webhookUrl)
    if (targetUrl.protocol !== "https:" && targetUrl.hostname !== "127.0.0.1") {
      throw new Error("Invalid protocol")
    }
  } catch {
    console.error("Invalid CONTACT_WEBHOOK_URL configuration")
    return json({ ok: false, error: "フォーム設定に不備があります。時間をおいてお試しください。" }, 503)
  }

  const payload = {
    secret: webhookSecret,
    category: validated.data.category,
    categoryLabel: validated.data.categoryLabel,
    priority: validated.data.priority,
    subject: escapeSheetFormula(validated.data.subject),
    message: escapeSheetFormula(validated.data.message),
    pageUrl: escapeSheetFormula(validated.data.pageUrl),
    replyContact: escapeSheetFormula(validated.data.replyContact),
    clientInfo: escapeSheetFormula(validated.data.clientInfo),
  }

  try {
    const upstream = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
    })

    if (!upstream.ok) {
      console.error("Contact webhook returned HTTP", upstream.status)
      return json({ ok: false, error: "記録サービスとの通信に失敗しました。時間をおいて再度お試しください。" }, 502)
    }

    const result = (await upstream.json().catch(() => null)) as { ok?: boolean; id?: string; error?: string } | null
    if (!result?.ok) {
      console.error("Contact webhook rejected payload", result?.error || "unknown")
      return json({ ok: false, error: "記録処理に失敗しました。時間をおいて再度お試しください。" }, 502)
    }

    return json({ ok: true, id: typeof result.id === "string" ? result.id : null }, 200)
  } catch (error) {
    console.error("Contact webhook fetch failed", String(error))
    return json({ ok: false, error: "記録サービスへの接続がタイムアウトしました。時間をおいて再度お試しください。" }, 502)
  }
}
