import type { BrawlerSnapshot } from "./brawler-page-data"

export interface DraftCategories {
  modes: string[]
  maps: string[]
  mode_to_maps: Record<string, string[]>
}

// Reject incomplete refreshes instead of replacing working form choices.
export function isDraftCategories(value: unknown): value is DraftCategories {
  if (!value || typeof value !== "object") return false
  const data = value as DraftCategories
  const ids = (rows: unknown): rows is string[] => Array.isArray(rows) && rows.length > 0 && rows.every(id => typeof id === "string" && id.trim().length > 0) && new Set(rows).size === rows.length
  return ids(data.modes) && ids(data.maps) && !!data.mode_to_maps && typeof data.mode_to_maps === "object" && !Array.isArray(data.mode_to_maps) &&
    data.modes.every(mode => ids(data.mode_to_maps[mode]) && data.mode_to_maps[mode].every(map => data.maps.includes(map))) &&
    data.maps.every(map => data.modes.some(mode => data.mode_to_maps[mode].includes(map)))
}

// The build already fetched these gachi associations. Keep the API's sorted default.
export function draftCategoriesFromSnapshot(snapshot: BrawlerSnapshot): DraftCategories {
  const mode_to_maps: Record<string, string[]> = {}
  for (const [map, modes] of Object.entries(snapshot.mapModes?.gachi || {})) {
    for (const mode of modes) (mode_to_maps[mode] ||= []).push(map)
  }
  for (const maps of Object.values(mode_to_maps)) maps.sort()
  const data = { modes: Object.keys(mode_to_maps).sort(), maps: Object.keys(snapshot.mapModes?.gachi || {}).sort(), mode_to_maps }
  if (!isDraftCategories(data)) throw new Error("Invalid draft categories snapshot")
  return data
}
