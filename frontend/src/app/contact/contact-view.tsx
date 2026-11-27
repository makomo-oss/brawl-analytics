"use client"

import { useEffect, useId, useRef, useState, type FormEvent } from "react"
import {
  AlertCircle,
  Bug,
  Check,
  CheckCircle2,
  Database,
  HelpCircle,
  Lightbulb,
  Loader2,
  MessageSquarePlus,
  RotateCcw,
  Send,
} from "lucide-react"
import Link from "@/components/document-link"
import {
  CONTACT_CATEGORIES,
  CONTACT_FROM_STORAGE_KEY,
  CONTACT_LIMITS,
  sanitizePagePath,
  validateContactInput,
  type ContactCategoryId,
  type ContactField,
} from "@/lib/contact"

const CATEGORY_ICONS: Record<ContactCategoryId, typeof Lightbulb> = {
  feature: Lightbulb,
  bug: Bug,
  data: Database,
  other: HelpCircle,
}

type FieldErrors = Partial<Record<ContactField, string>>
type TouchedFields = Partial<Record<ContactField, boolean>>

interface SubmittedSummary {
  ticketId: string | null
  categoryLabel: string
  subject: string
}

function summarizeClientInfo(): string {
  if (typeof navigator === "undefined" || typeof window === "undefined") return ""
  const ua = navigator.userAgent || ""
  const device = /iPhone|iPad|iPod|Android|Mobile/i.test(ua) ? "Mobile" : "Desktop"
  const os = /iPhone|iPad|iPod/i.test(ua)
    ? "iOS"
    : /Android/i.test(ua)
      ? "Android"
      : /Windows/i.test(ua)
        ? "Windows"
        : /Mac OS X|Macintosh/i.test(ua)
          ? "macOS"
          : /Linux/i.test(ua)
            ? "Linux"
            : "Other"
  const browser = /Edg\//i.test(ua)
    ? "Edge"
    : /Chrome\//i.test(ua) && !/Chromium/i.test(ua)
      ? "Chrome"
      : /Firefox\//i.test(ua)
        ? "Firefox"
        : /Safari\//i.test(ua) && !/Chrome\//i.test(ua)
          ? "Safari"
          : "Browser"
  return `${device} / ${os} / ${browser} (${window.innerWidth}x${window.innerHeight})`
}

function readInitialSourcePath(): string {
  if (typeof window === "undefined") return ""
  try {
    const queryFrom = new URLSearchParams(window.location.search).get("from")
    if (queryFrom) {
      const sanitized = sanitizePagePath(queryFrom)
      if (sanitized && sanitized !== "/contact") return sanitized
    }
    const stored = window.sessionStorage.getItem(CONTACT_FROM_STORAGE_KEY)
    if (stored) {
      window.sessionStorage.removeItem(CONTACT_FROM_STORAGE_KEY)
      const sanitized = sanitizePagePath(stored)
      if (sanitized && sanitized !== "/contact") return sanitized
    }
    if (document.referrer) {
      const ref = new URL(document.referrer)
      if (ref.origin === window.location.origin && ref.pathname !== "/contact") {
        return sanitizePagePath(ref.pathname + ref.search)
      }
    }
  } catch {
    // Ignore storage/URL access restrictions.
  }
  return ""
}

export default function ContactView() {
  const uid = useId()
  const formTitleId = `${uid}-title`
  const subjectId = `${uid}-subject`
  const subjectHintId = `${uid}-subject-hint`
  const subjectErrorId = `${uid}-subject-error`
  const messageId = `${uid}-message`
  const messageHintId = `${uid}-message-hint`
  const messageErrorId = `${uid}-message-error`
  const pageUrlId = `${uid}-page-url`
  const pageUrlHintId = `${uid}-page-url-hint`
  const pageUrlErrorId = `${uid}-page-url-error`
  const replyId = `${uid}-reply`
  const replyHintId = `${uid}-reply-hint`
  const replyErrorId = `${uid}-reply-error`
  const websiteId = `${uid}-website`

  const [category, setCategory] = useState<ContactCategoryId>("feature")
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")
  const [pageUrl, setPageUrl] = useState("")
  const [replyContact, setReplyContact] = useState("")
  const [website, setWebsite] = useState("")

  const [errors, setErrors] = useState<FieldErrors>({})
  const [touched, setTouched] = useState<TouchedFields>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState<SubmittedSummary | null>(null)
  const [announcement, setAnnouncement] = useState("")

  const subjectRef = useRef<HTMLInputElement>(null)
  const messageRef = useRef<HTMLTextAreaElement>(null)
  const pageUrlRef = useRef<HTMLInputElement>(null)
  const replyRef = useRef<HTMLInputElement>(null)
  const successRef = useRef<HTMLElement>(null)
  const announceTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const initialFrom = readInitialSourcePath()
    let frame = 0
    if (initialFrom) {
      frame = window.requestAnimationFrame(() => setPageUrl((prev) => prev || initialFrom))
    }
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      if (announceTimerRef.current !== null) window.clearTimeout(announceTimerRef.current)
    }
  }, [])

  const scheduleAnnouncement = (text: string) => {
    if (typeof window === "undefined") return
    if (announceTimerRef.current !== null) window.clearTimeout(announceTimerRef.current)
    setAnnouncement("")
    announceTimerRef.current = window.setTimeout(() => {
      setAnnouncement(text)
    }, 450)
  }

  const runFieldValidation = (
    field: ContactField,
    nextValues: {
      category?: ContactCategoryId
      subject?: string
      message?: string
      pageUrl?: string
      replyContact?: string
    } = {},
    announce = false,
  ) => {
    const result = validateContactInput({
      category: nextValues.category ?? category,
      subject: nextValues.subject ?? subject,
      message: nextValues.message ?? message,
      pageUrl: nextValues.pageUrl ?? pageUrl,
      replyContact: nextValues.replyContact ?? replyContact,
      website,
    })
    const fieldError = result.ok ? undefined : result.errors[field]
    setErrors((prev) => {
      if (prev[field] === fieldError) return prev
      const next = { ...prev }
      if (fieldError) next[field] = fieldError
      else delete next[field]
      return next
    })
    if (announce && fieldError) {
      scheduleAnnouncement(`エラー: ${fieldError}`)
    } else if (!fieldError) {
      setAnnouncement("")
    }
  }

  const handleBlur = (field: ContactField) => {
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }))
    runFieldValidation(field, {}, true)
  }

  const focusFirstInvalid = (fieldErrors: FieldErrors) => {
    if (fieldErrors.subject) subjectRef.current?.focus()
    else if (fieldErrors.message) messageRef.current?.focus()
    else if (fieldErrors.pageUrl) pageUrlRef.current?.focus()
    else if (fieldErrors.replyContact) replyRef.current?.focus()
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmitting) return
    setSubmitError(null)

    const validation = validateContactInput({
      category,
      subject,
      message,
      pageUrl,
      replyContact,
      clientInfo: summarizeClientInfo(),
      website,
    })

    if (!validation.ok) {
      setTouched({ category: true, subject: true, message: true, pageUrl: true, replyContact: true })
      setErrors(validation.errors)
      focusFirstInvalid(validation.errors)
      return
    }

    setErrors({})
    setIsSubmitting(true)

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          category,
          subject,
          message,
          pageUrl,
          replyContact,
          clientInfo: summarizeClientInfo(),
          website,
        }),
        signal: AbortSignal.timeout(15_000),
      })

      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; id?: string; error?: string; errors?: FieldErrors }
        | null

      if (!response.ok || !body?.ok) {
        if (body?.errors && Object.keys(body.errors).length > 0) {
          setTouched({ category: true, subject: true, message: true, pageUrl: true, replyContact: true })
          setErrors(body.errors)
          focusFirstInvalid(body.errors)
        }
        setSubmitError(
          body?.error ||
            (response.status === 429
              ? "送信回数が上限に達しました。しばらく時間をおいてから再度お試しください。"
              : "送信できませんでした。時間をおいてもう一度お試しください。"),
        )
        return
      }

      setSubmitted({
        ticketId: typeof body.id === "string" && body.id ? body.id : null,
        categoryLabel: validation.data.categoryLabel,
        subject: validation.data.subject,
      })
      setSubject("")
      setMessage("")
      setReplyContact("")
      setWebsite("")
      setTouched({})
      setErrors({})
      window.requestAnimationFrame(() => successRef.current?.focus())
    } catch {
      setSubmitError("通信エラーが発生しました。ネットワーク接続をご確認のうえ、もう一度お試しください。")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleResetToForm = () => {
    setSubmitted(null)
    setSubmitError(null)
    setAnnouncement("")
  }

  const subjectInvalid = Boolean(touched.subject && errors.subject)
  const messageInvalid = Boolean(touched.message && errors.message)
  const pageUrlInvalid = Boolean(touched.pageUrl && errors.pageUrl)
  const replyInvalid = Boolean(touched.replyContact && errors.replyContact)
  const messageCount = message.trim().length

  return (
    <div className="arena-workspace arena-contact-page max-w-2xl mx-auto space-y-6">
      <header className="space-y-3">
        <p className="arena-home-kicker">
          <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
          FEEDBACK &amp; SUPPORT
        </p>
        <h1 id={formTitleId} className="text-[1.625rem] sm:text-4xl leading-tight font-extrabold tracking-tight">
          お問い合わせ・ご要望
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          新機能のリクエスト、不具合の報告、キャラ名や統計表示の誤りなど、気軽にお送りください。いただいた内容はすべて運営が確認し、今後の改善に活かします。
        </p>
      </header>

      <div aria-live="polite" className="arena-visually-hidden">
        {announcement}
      </div>

      {submitted ? (
        <section
          ref={successRef}
          tabIndex={-1}
          role="status"
          aria-live="polite"
          className="arena-contact-card arena-contact-success space-y-5"
        >
          <div className="flex items-start gap-3.5">
            <span className="arena-contact-success-icon" aria-hidden="true">
              <CheckCircle2 className="h-6 w-6" />
            </span>
            <div className="space-y-1.5 min-w-0">
              <h2 className="text-xl font-extrabold text-zinc-100">送信を受け付けました</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                ご連絡ありがとうございます。内容を確認のうえ、順次対応いたします。
              </p>
            </div>
          </div>

          <dl className="arena-contact-summary">
            {submitted.ticketId && (
              <div>
                <dt>受付ID</dt>
                <dd className="font-mono font-bold text-[#ffe359]">{submitted.ticketId}</dd>
              </div>
            )}
            <div>
              <dt>種別</dt>
              <dd>{submitted.categoryLabel}</dd>
            </div>
            <div>
              <dt>件名</dt>
              <dd className="break-words">{submitted.subject}</dd>
            </div>
          </dl>

          <div className="arena-contact-actions-row flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleResetToForm}
              className="arena-contact-secondary-btn"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              続けて別の内容を送る
            </button>
            <Link href="/" className="arena-contact-submit-btn">
              ホームに戻る
            </Link>
          </div>
        </section>
      ) : (
        <form
          action="/api/contact"
          method="POST"
          aria-labelledby={formTitleId}
          noValidate
          onSubmit={handleSubmit}
          className="arena-contact-card space-y-6"
        >
          {/* Honeypot field hidden from users and assistive technology */}
          <div className="arena-contact-honeypot" aria-hidden="true">
            <label htmlFor={websiteId}>Website</label>
            <input
              id={websiteId}
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </div>

          <fieldset className="arena-contact-fieldset">
            <legend className="arena-contact-label">
              種別
              <span className="arena-contact-badge is-required">必須</span>
            </legend>
            <div className="arena-contact-category-grid">
              {CONTACT_CATEGORIES.map((item) => {
                const Icon = CATEGORY_ICONS[item.id]
                const radioId = `${uid}-cat-${item.id}`
                const checked = category === item.id
                return (
                  <div key={item.id} className="arena-contact-radio-item">
                    <input
                      id={radioId}
                      type="radio"
                      name="category"
                      value={item.id}
                      checked={checked}
                      required
                      onChange={() => {
                        setCategory(item.id)
                        if (touched.category) runFieldValidation("category", { category: item.id })
                      }}
                      className="arena-visually-hidden arena-contact-radio-input"
                    />
                    <label htmlFor={radioId} className="arena-contact-radio-card">
                      <span className="arena-contact-radio-head">
                        <span className="arena-contact-radio-icon" aria-hidden="true">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="arena-contact-radio-title">{item.label}</span>
                        <span className="arena-contact-radio-check" aria-hidden="true">
                          {checked && <Check className="h-3.5 w-3.5" />}
                        </span>
                      </span>
                      <span className="arena-contact-radio-desc">{item.description}</span>
                    </label>
                  </div>
                )
              })}
            </div>
          </fieldset>

          <div className="arena-contact-field">
            <label htmlFor={subjectId} className="arena-contact-label">
              件名
              <span className="arena-contact-badge is-optional">任意</span>
            </label>
            <p id={subjectHintId} className="arena-contact-hint">
              未入力の場合は内容の先頭から自動設定されます（{CONTACT_LIMITS.subjectMax}文字以内）。
            </p>
            <input
              ref={subjectRef}
              id={subjectId}
              name="subject"
              type="text"
              maxLength={CONTACT_LIMITS.subjectMax}
              enterKeyHint="next"
              placeholder="例：マップ別ページに検索フィルターを追加してほしい"
              value={subject}
              aria-invalid={subjectInvalid ? "true" : "false"}
              aria-describedby={subjectInvalid ? `${subjectHintId} ${subjectErrorId}` : subjectHintId}
              onBlur={() => handleBlur("subject")}
              onChange={(e) => {
                const next = e.target.value
                setSubject(next)
                if (errors.subject) runFieldValidation("subject", { subject: next })
              }}
              className={`arena-contact-input${subjectInvalid ? " is-invalid" : ""}`}
            />
            {subjectInvalid && (
              <p id={subjectErrorId} className="arena-contact-error">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{errors.subject}</span>
              </p>
            )}
          </div>

          <div className="arena-contact-field">
            <div className="arena-contact-label-row">
              <label htmlFor={messageId} className="arena-contact-label">
                内容
                <span className="arena-contact-badge is-required">必須</span>
              </label>
              <span className="arena-contact-counter" aria-hidden="true">
                {messageCount.toLocaleString("ja-JP")} / {CONTACT_LIMITS.messageMax.toLocaleString("ja-JP")}
              </span>
            </div>
            <p id={messageHintId} className="arena-contact-hint">
              {CONTACT_LIMITS.messageMin}〜{CONTACT_LIMITS.messageMax.toLocaleString("ja-JP")}文字。不具合の場合は発生した手順や端末も書いていただけると助かります。
            </p>
            <textarea
              ref={messageRef}
              id={messageId}
              name="message"
              required
              minLength={CONTACT_LIMITS.messageMin}
              maxLength={CONTACT_LIMITS.messageMax}
              rows={6}
              placeholder="要望や気づいたことを自由にご記入ください"
              value={message}
              aria-invalid={messageInvalid ? "true" : "false"}
              aria-describedby={messageInvalid ? `${messageHintId} ${messageErrorId}` : messageHintId}
              onBlur={() => handleBlur("message")}
              onChange={(e) => {
                const next = e.target.value
                setMessage(next)
                if (errors.message) runFieldValidation("message", { message: next })
              }}
              className={`arena-contact-textarea${messageInvalid ? " is-invalid" : ""}`}
            />
            {messageInvalid && (
              <p id={messageErrorId} className="arena-contact-error">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{errors.message}</span>
              </p>
            )}
          </div>

          <div className="arena-contact-field">
            <label htmlFor={pageUrlId} className="arena-contact-label">
              関連ページ
              <span className="arena-contact-badge is-optional">任意</span>
            </label>
            <p id={pageUrlHintId} className="arena-contact-hint">
              直前に見ていたページがある場合は自動で入ります。不要な場合は空欄のままで問題ありません。
            </p>
            <input
              ref={pageUrlRef}
              id={pageUrlId}
              name="pageUrl"
              type="text"
              maxLength={CONTACT_LIMITS.pageUrlMax}
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="next"
              placeholder="例：/tier または https://brawl-lab.sozai-hub.com/brawlers/amber"
              value={pageUrl}
              aria-invalid={pageUrlInvalid ? "true" : "false"}
              aria-describedby={pageUrlInvalid ? `${pageUrlHintId} ${pageUrlErrorId}` : pageUrlHintId}
              onBlur={() => handleBlur("pageUrl")}
              onChange={(e) => {
                const next = e.target.value
                setPageUrl(next)
                if (errors.pageUrl) runFieldValidation("pageUrl", { pageUrl: next })
              }}
              className={`arena-contact-input${pageUrlInvalid ? " is-invalid" : ""}`}
            />
            {pageUrlInvalid && (
              <p id={pageUrlErrorId} className="arena-contact-error">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{errors.pageUrl}</span>
              </p>
            )}
          </div>

          <div className="arena-contact-field">
            <label htmlFor={replyId} className="arena-contact-label">
              返信先（メールまたはX ID）
              <span className="arena-contact-badge is-optional">任意</span>
            </label>
            <p id={replyHintId} className="arena-contact-hint">
              返信が必要な場合のみご記入ください（例：you@example.com / @username）。未記入でも送信できます。
            </p>
            <input
              ref={replyRef}
              id={replyId}
              name="replyContact"
              type="text"
              maxLength={CONTACT_LIMITS.replyContactMax}
              autoComplete="email"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="done"
              placeholder="you@example.com または @username"
              value={replyContact}
              aria-invalid={replyInvalid ? "true" : "false"}
              aria-describedby={replyInvalid ? `${replyHintId} ${replyErrorId}` : replyHintId}
              onBlur={() => handleBlur("replyContact")}
              onChange={(e) => {
                const next = e.target.value
                setReplyContact(next)
                if (errors.replyContact) runFieldValidation("replyContact", { replyContact: next })
              }}
              className={`arena-contact-input${replyInvalid ? " is-invalid" : ""}`}
            />
            {replyInvalid && (
              <p id={replyErrorId} className="arena-contact-error">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{errors.replyContact}</span>
              </p>
            )}
          </div>

          {submitError && (
            <div role="alert" className="arena-contact-alert">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{submitError}</span>
            </div>
          )}

          <div className="arena-contact-actions">
            <button
              type="submit"
              disabled={isSubmitting}
              className="arena-contact-submit-btn"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>送信中...</span>
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" aria-hidden="true" />
                  <span>送信する</span>
                </>
              )}
            </button>
            <p className="text-xs leading-relaxed text-muted-foreground">
              送信内容は運営確認・改善のみに利用し、外部に公開しません。
              <Link href="/about#privacy" className="text-primary hover:underline ml-1">
                データの扱い
              </Link>
            </p>
          </div>
        </form>
      )}
    </div>
  )
}
