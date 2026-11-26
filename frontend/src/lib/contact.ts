export const CONTACT_CATEGORIES = [
  {
    id: "feature",
    label: "機能要望",
    description: "ほしい機能や使いやすさの改善アイデア",
    defaultPriority: "中",
  },
  {
    id: "bug",
    label: "不具合報告",
    description: "表示崩れ・エラー・動作がおかしい箇所",
    defaultPriority: "高",
  },
  {
    id: "data",
    label: "データ・表記ミス",
    description: "キャラ名・マップ名・統計表示の誤りなど",
    defaultPriority: "中",
  },
  {
    id: "other",
    label: "その他",
    description: "運営へのご質問・ご連絡など",
    defaultPriority: "中",
  },
] as const

export type ContactCategoryId = (typeof CONTACT_CATEGORIES)[number]["id"]
export type ContactCategoryLabel = (typeof CONTACT_CATEGORIES)[number]["label"]
export type ContactPriority = "高" | "中" | "低"
export type ContactField = "category" | "subject" | "message" | "pageUrl" | "replyContact"

export const CONTACT_LIMITS = {
  subjectMax: 80,
  messageMin: 5,
  messageMax: 2000,
  pageUrlMax: 200,
  replyContactMax: 120,
  clientInfoMax: 160,
} as const

export const CONTACT_FROM_STORAGE_KEY = "burolabo:contact-from"

export const contactCopy = {
  title: "お問い合わせ・ご要望｜機能リクエスト・不具合報告",
  description: "ブロラボ（Brawl Lab）への機能要望、不具合報告、データ・表記ミスの連絡、その他のお問い合わせをお送りいただけるフォームです。",
}

export interface ContactSubmissionInput {
  category?: unknown
  subject?: unknown
  message?: unknown
  pageUrl?: unknown
  replyContact?: unknown
  clientInfo?: unknown
  website?: unknown
}

export interface NormalizedContactPayload {
  category: ContactCategoryId
  categoryLabel: ContactCategoryLabel
  priority: ContactPriority
  subject: string
  message: string
  pageUrl: string
  replyContact: string
  clientInfo: string
}

export type ContactValidationResult =
  | { ok: true; data: NormalizedContactPayload; honeypot: boolean }
  | { ok: false; errors: Partial<Record<ContactField, string>> }

const CATEGORY_MAP = new Map<string, (typeof CONTACT_CATEGORIES)[number]>(
  CONTACT_CATEGORIES.map((item) => [item.id, item]),
)

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function cleanText(value: unknown, allowNewlines: boolean): string {
  if (typeof value !== "string") return ""
  const normalized = allowNewlines
    ? value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    : value.replace(/[\r\n\t]+/g, " ").replace(/[\u0000-\u001F\u007F]/g, "")
  return normalized.trim()
}

export function deriveFallbackSubject(message: string): string {
  const firstLine = message.split("\n")[0]?.trim() || ""
  return firstLine.length > 32 ? `${firstLine.slice(0, 32)}…` : firstLine
}

export function sanitizePagePath(raw: string): string {
  const cleaned = cleanText(raw, false)
  if (!cleaned) return ""
  if (cleaned.startsWith("/")) {
    return cleaned.startsWith("//") ? "" : cleaned.slice(0, CONTACT_LIMITS.pageUrlMax)
  }
  try {
    const parsed = new URL(cleaned)
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.href.slice(0, CONTACT_LIMITS.pageUrlMax)
    }
  } catch {
    // Reject non-URL arbitrary schemes such as javascript:
  }
  return ""
}

export function escapeSheetFormula(value: string): string {
  if (!value) return ""
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
}

export function validateContactInput(input: ContactSubmissionInput): ContactValidationResult {
  const honeypot = cleanText(input.website, false).length > 0
  const errors: Partial<Record<ContactField, string>> = {}

  const rawCategory = cleanText(input.category, false)
  const category = CATEGORY_MAP.get(rawCategory)
  if (!category) {
    errors.category = "お問い合わせの種別を選択してください。"
  }

  const subject = cleanText(input.subject, false)
  if (subject.length > CONTACT_LIMITS.subjectMax) {
    errors.subject = `件名は${CONTACT_LIMITS.subjectMax}文字以内で入力してください。`
  }

  const message = cleanText(input.message, true)
  if (!message) {
    errors.message = "内容を入力してください。"
  } else if (message.length < CONTACT_LIMITS.messageMin) {
    errors.message = `内容は${CONTACT_LIMITS.messageMin}文字以上で入力してください。`
  } else if (message.length > CONTACT_LIMITS.messageMax) {
    errors.message = `内容は${CONTACT_LIMITS.messageMax}文字以内で入力してください。`
  }

  const rawPageUrl = cleanText(input.pageUrl, false)
  let pageUrl = ""
  if (rawPageUrl) {
    if (rawPageUrl.length > CONTACT_LIMITS.pageUrlMax) {
      errors.pageUrl = `関連ページは${CONTACT_LIMITS.pageUrlMax}文字以内で入力してください。`
    } else {
      pageUrl = sanitizePagePath(rawPageUrl)
      if (!pageUrl) {
        errors.pageUrl = "関連ページは「/tier」などのパス、または「https://」から始まるURLで入力してください。"
      }
    }
  }

  const replyContact = cleanText(input.replyContact, false)
  if (replyContact) {
    if (replyContact.length > CONTACT_LIMITS.replyContactMax) {
      errors.replyContact = `返信先は${CONTACT_LIMITS.replyContactMax}文字以内で入力してください。`
    } else if (replyContact.includes("@") && !replyContact.startsWith("@") && !EMAIL_PATTERN.test(replyContact)) {
      errors.replyContact = "メールアドレスは「you@example.com」の形式で入力してください（XのIDは先頭に@を付けて入力できます）。"
    }
  }

  const clientInfo = cleanText(input.clientInfo, false).slice(0, CONTACT_LIMITS.clientInfoMax)

  if (Object.keys(errors).length > 0 || !category) {
    return { ok: false, errors }
  }

  return {
    ok: true,
    honeypot,
    data: {
      category: category.id,
      categoryLabel: category.label,
      priority: category.defaultPriority,
      subject: subject || deriveFallbackSubject(message),
      message,
      pageUrl,
      replyContact,
      clientInfo,
    },
  }
}
