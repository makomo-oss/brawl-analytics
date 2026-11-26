"use client"

import { useEffect, useSyncExternalStore } from "react"
import { API_URL } from "./config"
import { registerMapCatalog } from "./maps"

const CACHE_KEY = "brawl:map-catalog:v1"
const REFRESH_MS = 60 * 60 * 1000
let version = 0
let nextRefresh = 0
let restored = false
let pending: Promise<void> | null = null
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
const snapshot = () => version
const serverSnapshot = () => 0

function applyAndNotify(payload: unknown) {
  if (registerMapCatalog(payload)) {
    version += 1
    listeners.forEach(listener => listener())
  }
}

async function refresh() {
  if (pending || Date.now() < nextRefresh || document.visibilityState === "hidden") return
  pending = (async () => {
    nextRefresh = Date.now() + 5 * 60 * 1000
    try {
      const response = await fetch(`${API_URL}/meta/maps`, { signal: AbortSignal.timeout(30000) })
      if (!response.ok) return
      const payload: unknown = await response.json()
      applyAndNotify(payload)
      nextRefresh = Date.now() + REFRESH_MS
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), ...payload as object })) } catch { /* Storage may be disabled. */ }
    } catch { /* Keep the bundled/cached catalog while the server is unavailable. */ }
  })().finally(() => { pending = null })
  await pending
}

export function useMapCatalog() {
  const revision = useSyncExternalStore(subscribe, snapshot, serverSnapshot)
  useEffect(() => {
    if (!restored) {
      restored = true
      try {
        const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null")
        if (cached && typeof cached === "object") {
          applyAndNotify(cached)
          if (typeof cached.savedAt === "number" && cached.savedAt <= Date.now()) {
            nextRefresh = cached.savedAt + REFRESH_MS
          }
        }
      } catch { /* Invalid/unavailable browser storage does not block rendering. */ }
    }
    void refresh()
    const interval = setInterval(refresh, 5 * 60 * 1000)
    document.addEventListener("visibilitychange", refresh)
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", refresh) }
  }, [])
  return revision
}
