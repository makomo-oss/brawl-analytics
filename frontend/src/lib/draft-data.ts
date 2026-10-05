import { fetchPublicStats, getCachedPublicStats } from "./public-stats-cache"

export function draftDataUrls(api: string, mode: string, map: string) {
  const mapUrl = `${api}/meta/tier-list?type=gachi&sub_type=map&id=${encodeURIComponent(map)}&mode=${encodeURIComponent(mode)}`
  return {
    base: mapUrl,
    details: `${mapUrl}&include_details=true&include_matchup_fallback=false`,
    mode: `${api}/meta/tier-list?type=gachi&sub_type=mode&id=${encodeURIComponent(mode)}`
  }
}

type DraftUrls = ReturnType<typeof draftDataUrls>

function withModeScores(data: any, modeData: any) {
  // Both cache reads and fetches return isolated copies.
  for (const [name, stats] of Object.entries<any>(data.characters ?? {})) {
    stats.mode_score = modeData.characters?.[name]?.score ?? 50
  }
  return data
}

export function cachedDraftDetails(urls: DraftUrls) {
  const data = getCachedPublicStats(urls.details)
  const mode = getCachedPublicStats(urls.mode)
  return data && Object.keys(data.characters ?? {}).length && mode ? withModeScores(data, mode) : undefined
}

export function fetchDraftBase(urls: DraftUrls) {
  // BAN ranking only uses map scores. Do not wait for the pair matrix here.
  return fetchPublicStats(urls.base)
}

export async function fetchDraftDetails(urls: DraftUrls) {
  const [data, mode] = await Promise.all([
    fetchPublicStats(urls.details), fetchPublicStats(urls.mode)
  ])
  if (!Object.keys(data.characters ?? {}).length) throw new Error("このマップのガチバトルデータが不足しています。別のマップを選択してください。")
  return withModeScores(data, mode)
}

export function prefetchDraftData(urls: DraftUrls) {
  // Reuse in-flight requests when Start is clicked; failures remain retryable.
  void fetchDraftBase(urls).catch(() => {})
  void fetchDraftDetails(urls).catch(() => {})
}
