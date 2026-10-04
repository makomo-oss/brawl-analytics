"use client"

import { useEffect, useSyncExternalStore } from "react"
import { API_URL } from "./config"
import { BRAWLER_MAP, type BrawlerRarity } from "./brawlers"

const CACHE_KEY = "brawl:brawler-catalog:v1"
const REFRESH_MS = 60 * 60 * 1000
let version = 0
let nextRefresh = 0
let restored = false
let pending: Promise<void> | null = null
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
const snapshot = () => version
const serverSnapshot = () => 0

export function applyBrawlerCatalog(payload: unknown): boolean {
  if (!payload || typeof payload !== "object" || !("brawlers" in payload) || !Array.isArray(payload.brawlers) || payload.brawlers.length > 500) return false
  let changed = false
  let accepted = 0
  for (const row of payload.brawlers) {
    if (!row || typeof row.name !== "string" || !row.name.trim() || row.name.length > 80 || !Number.isInteger(row.id)) continue
    const key = row.name.trim().toLowerCase()
    if (["__proto__", "constructor", "prototype"].includes(key)) continue
    const old = BRAWLER_MAP[key]
    const name = typeof row.nameJa === "string" && row.nameJa.trim() && !row.nameJa.includes("\ufffd") && row.nameJa.trim().toLowerCase() !== key ? row.nameJa.trim() : old?.ja || row.name
    let image = old?.imageUrl || ""
    if (typeof row.imageUrl === "string" && row.imageUrl) {
      try {
        const url = new URL(row.imageUrl)
        if (url.protocol !== "https:" || url.hostname !== "cdn.brawlify.com" || url.port || !url.pathname.endsWith(".png")) continue
        image = row.imageUrl
      } catch { continue }
    }
    accepted += 1
    const value = row.rarity
    const rarity: BrawlerRarity | null = value && Number.isInteger(value.id) && value.id >= 1 && value.id <= 1000 && typeof value.name === "string" && value.name.trim() && value.name.length <= 80
      ? { id: value.id, name: value.name.trim() } : old?.rarity || null
    if (!old || old.ja !== name || old.imageUrl !== image || old.rarity?.id !== rarity?.id || old.rarity?.name !== rarity?.name) {
      BRAWLER_MAP[key] = { ja: name, imageUrl: image, rarity }
      changed = true
    }
  }
  if (changed) { version += 1; listeners.forEach(listener => listener()) }
  return accepted > 0
}

async function refresh() {
  if (pending || Date.now() < nextRefresh || document.visibilityState === "hidden") return
  pending = (async () => {
    nextRefresh = Date.now() + 5 * 60 * 1000
    try {
      const response = await fetch(`${API_URL}/meta/brawlers`, { signal: AbortSignal.timeout(50000) })
      if (!response.ok) return
      const payload: unknown = await response.json()
      if (!applyBrawlerCatalog(payload)) return
      nextRefresh = Date.now() + REFRESH_MS
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), ...payload as object })) } catch { /* Storage may be disabled. */ }
    } catch { /* Keep the bundled/cached catalog while the server is unavailable. */ }
  })().finally(() => { pending = null })
  await pending
}

export function useBrawlerCatalog() {
  const revision = useSyncExternalStore(subscribe, snapshot, serverSnapshot)
  useEffect(() => {
    if (!restored) {
      restored = true
      try {
        const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null")
        if (cached && applyBrawlerCatalog(cached) && typeof cached.savedAt === "number" && cached.savedAt <= Date.now()) {
          nextRefresh = cached.savedAt + REFRESH_MS
        }
      } catch { /* Invalid/unavailable browser storage does not block rendering. */ }
    }
    refresh()
    const interval = setInterval(refresh, 5 * 60 * 1000)
    document.addEventListener("visibilitychange", refresh)
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", refresh) }
  }, [])
  return revision
}
