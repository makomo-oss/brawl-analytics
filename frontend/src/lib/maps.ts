import mapCatalogSeed from "./map-catalog.json"
import type { ConditionEntry } from "./condition-pages"

const MAP_IMAGE_BASE = "https://cdn.brawlify.com/maps/regular"
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"])

const exactMapIds: Record<string, number> = {}
const lowerMapIds: Record<string, number> = {}
const normalizedMapIds: Record<string, number> = {}

function normalizeMapKey(name: string): string {
  return name.toLowerCase().replace(/[\s_\-'’]/g, "")
}

function setMapEntry(rawName: string, imageId: number): boolean {
  const clean = rawName.trim()
  if (!clean || clean.length > 120 || !Number.isInteger(imageId) || imageId <= 0) return false
  const lower = clean.toLowerCase()
  const norm = normalizeMapKey(clean)
  if (FORBIDDEN_KEYS.has(clean) || FORBIDDEN_KEYS.has(lower) || FORBIDDEN_KEYS.has(norm)) return false
  const changed = exactMapIds[clean] !== imageId
  exactMapIds[clean] = imageId
  lowerMapIds[lower] = imageId
  if (norm) normalizedMapIds[norm] = imageId
  return changed
}

for (const [name, id] of Object.entries(mapCatalogSeed as Record<string, number>)) {
  setMapEntry(name, id)
}

export function registerMapCatalog(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false
  const maps = "maps" in payload ? (payload as { maps?: unknown }).maps : payload
  if (!maps || typeof maps !== "object" || Array.isArray(maps)) return false
  const entries = Object.entries(maps as Record<string, unknown>)
  if (entries.length === 0 || entries.length > 5000) return false

  let changed = false
  let accepted = 0
  for (const [name, value] of entries) {
    if (typeof value === "number" && Number.isInteger(value) && value > 0) {
      accepted += 1
      if (setMapEntry(name, value)) changed = true
    }
  }
  return accepted > 0 && changed
}

export function getMapImageUrl(mapName: unknown): string {
  if (!mapName || typeof mapName !== "string") return ""
  let clean = mapName.trim()
  if (clean.startsWith("gachi_")) {
    clean = clean.slice(6).trim()
  }
  if (!clean) return ""

  const id =
    (Object.hasOwn(exactMapIds, clean) ? exactMapIds[clean] : undefined) ??
    (Object.hasOwn(lowerMapIds, clean.toLowerCase()) ? lowerMapIds[clean.toLowerCase()] : undefined) ??
    (Object.hasOwn(normalizedMapIds, normalizeMapKey(clean)) ? normalizedMapIds[normalizeMapKey(clean)] : undefined)

  return id ? `${MAP_IMAGE_BASE}/${id}.png` : ""
}

export function filterMapsByMode(entries: ConditionEntry[], modeId: string): ConditionEntry[] {
  if (!modeId || modeId === "all") return entries
  return entries.filter(entry => entry.modeIds.includes(modeId))
}

export function countMapsByMode(entries: ConditionEntry[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const entry of entries) {
    for (const modeId of entry.modeIds) {
      counts[modeId] = (counts[modeId] || 0) + 1
    }
  }
  return counts
}
