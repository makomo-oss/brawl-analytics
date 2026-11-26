"use client"

import { useEffect, useRef, useState } from "react"
import { RefreshCw, Clock3, Info } from "lucide-react"
import { API_URL } from "@/lib/config"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface SyncState {
  enabled: boolean; interval_minutes: number; last_sync_at: string | null
  next_sync_at: string | null; last_new_matches: number; last_error: string | null
  gap_detected_at: string | null
}
const timestamp = (value: string) => new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
const tokenKey = (tag: string) => `brawl:auto-sync:${tag}`
const SYNC_STATE_TTL_MS = 30_000
const syncStateCache = new Map<string, { state: SyncState; savedAt: number }>()
function getFreshCachedSync(tag: string): SyncState | null {
  const cached = syncStateCache.get(tag)
  return cached && Date.now() - cached.savedAt < SYNC_STATE_TTL_MS ? cached.state : null
}
function readToken(tag: string) {
  const value = localStorage.getItem(tokenKey(tag))
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null
}

export default function PlayerAutoSync({ playerTag, onCollected }: { playerTag: string; onCollected: () => void }) {
  const tag = playerTag.replace(/^#+/, "").toUpperCase()
  const [state, setState] = useState<SyncState | null>(() => getFreshCachedSync(tag))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [retry, setRetry] = useState(0)
  const lastCollection = useRef<string | null | undefined>(undefined)
  const requestVersion = useRef(0)
  const onCollectedRef = useRef(onCollected)
  useEffect(() => { onCollectedRef.current = onCollected }, [onCollected])

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    let pending = false
    async function refresh() {
      if (pending || document.visibilityState === "hidden") return
      pending = true
      const version = requestVersion.current
      try {
        const token = readToken(tag)
        const response = await fetch(`${API_URL}/player/${encodeURIComponent(tag)}/auto-sync`, {
          headers: token ? { "auto-sync-token": token } : {}, signal: controller.signal,
        })
        if (!response.ok) throw new Error("自動同期の設定を取得できませんでした。")
        const result: SyncState = await response.json()
        if (!active || requestVersion.current !== version) return
        syncStateCache.set(tag, { state: result, savedAt: Date.now() })
        if (lastCollection.current !== undefined && result.last_sync_at && lastCollection.current !== result.last_sync_at) onCollectedRef.current()
        lastCollection.current = result.last_sync_at
        setState(result)
        setError("")
      } catch (err) {
        if (active && !controller.signal.aborted) setError(err instanceof Error ? err.message : "自動同期の設定を確認できませんでした。")
      } finally { pending = false }
    }
    const cached = getFreshCachedSync(tag)
    if (retry === 0 && cached) {
      lastCollection.current = cached.last_sync_at
    } else {
      refresh()
    }
    const interval = setInterval(refresh, 60000)
    document.addEventListener("visibilitychange", refresh)
    return () => { active = false; controller.abort(); clearInterval(interval); document.removeEventListener("visibilitychange", refresh) }
  }, [tag, retry])

  async function toggle() {
    if (!state || saving) return
    requestVersion.current += 1
    setSaving(true)
    setError("")
    try {
      let token = readToken(tag)
      if (!token) {
        token = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("")
        localStorage.setItem(tokenKey(tag), token)
      }
      const response = await fetch(`${API_URL}/player/${encodeURIComponent(tag)}/auto-sync`, {
        method: "PUT", headers: { "Content-Type": "application/json", "auto-sync-token": token },
        body: JSON.stringify({ enabled: !state.enabled }),
      })
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { detail?: unknown }
        throw new Error(typeof result.detail === "string" ? result.detail : "自動同期の設定を保存できませんでした。")
      }
      const result: SyncState = await response.json()
      syncStateCache.set(tag, { state: result, savedAt: Date.now() })
      setState(result)
      lastCollection.current = result.last_sync_at
    } catch (err) { setError(err instanceof Error ? err.message : "設定を保存できませんでした。") }
    finally { requestVersion.current += 1; setSaving(false) }
  }

  return <div className={`space-y-3 rounded-2xl border bg-gradient-to-r from-card via-card to-purple-950/20 p-4 shadow-lg sm:p-5 ${state?.enabled ? "border-purple-500/40" : "border-primary/20"}`}>
    <div className="flex items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-purple-500/15 text-purple-400"><RefreshCw className={`size-5 ${saving ? "animate-spin" : ""}`} /></span><div><h2 className="text-sm font-extrabold">このプレイヤーの自動同期</h2><p className="mt-0.5 text-xs text-muted-foreground">#{tag} の戦績を自動で蓄積</p></div></div>
      <div className="flex shrink-0 items-center gap-2"><span className={`text-xs font-bold ${state?.enabled ? "text-purple-300" : "text-muted-foreground"}`}>{saving ? "保存中" : state ? state.enabled ? "ON" : "OFF" : error ? "未確認" : "読込中"}</span><button type="button" role="switch" aria-label={`#${tag} の自動同期`} aria-checked={Boolean(state?.enabled)} disabled={saving || !state} onClick={toggle} className={`relative h-7 w-12 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50 ${state?.enabled ? "border-purple-400/50 bg-gradient-to-r from-purple-600 to-indigo-600 shadow-lg shadow-purple-500/20" : "border-border bg-secondary"}`}><span className={`absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform ${state?.enabled ? "translate-x-[23px]" : "translate-x-[3px]"} left-0`} /></button></div>
    </div>
    <p className="text-xs leading-relaxed text-muted-foreground">ONの間はサイトを閉じても自動で戦績を取得します。</p>
    {state?.enabled && <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-purple-500/5 p-3 text-[11px] text-muted-foreground"><span className="flex items-center gap-1.5"><Clock3 className="size-3.5 text-purple-400" />{state.last_sync_at ? `最終取得 ${timestamp(state.last_sync_at)}` : "初回の取得を待っています"}</span><Badge variant="outline" className="border-purple-500/25 text-purple-300">{state.interval_minutes}分間隔</Badge>{state.last_sync_at && <span>前回 {state.last_new_matches}試合を追加</span>}{state.next_sync_at && <span>次回予定 {timestamp(state.next_sync_at)}</span>}</div>}
    {state?.enabled && state.last_error && <p role="status" className="text-xs text-amber-400">取得に失敗したため、自動で再試行しています。</p>}
    {state?.enabled && state.gap_detected_at && <p className="flex items-start gap-2 text-xs text-amber-400"><Info className="size-3.5 shrink-0" />取得の間に履歴が入れ替わり、未取得の試合がある可能性があります。</p>}
    {error && <div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-rose-400"><span>{error}</span><Button variant="ghost" size="sm" onClick={() => setRetry(value => value + 1)}>設定を再確認</Button></div>}
  </div>
}
