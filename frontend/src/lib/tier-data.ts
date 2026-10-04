export interface TierListData {
  tiers: Record<string, string[]>
  characters: Record<string, {
    score: number
    win_rate: number
    use_rate: number
    total_matches: number
    [key: string]: unknown
  }>
  metrics: { analyzed_matches: number; [key: string]: unknown }
  updated_at: string | null
}

export function isTierListData(value: unknown): value is TierListData {
  if (!value || typeof value !== "object") return false
  const data = value as Partial<TierListData>
  if (!data.tiers || typeof data.tiers !== "object" || Array.isArray(data.tiers) ||
      !data.characters || typeof data.characters !== "object" || Array.isArray(data.characters) ||
      !data.metrics || !Number.isFinite(data.metrics.analyzed_matches) ||
      !(data.updated_at === null || typeof data.updated_at === "string")) return false
  return Object.values(data.tiers).every(names => Array.isArray(names) && names.every(name => {
    if (typeof name !== "string") return false
    const stats = data.characters?.[name]
    return !!stats && [stats.score, stats.win_rate, stats.use_rate, stats.total_matches].every(Number.isFinite)
  }))
}
