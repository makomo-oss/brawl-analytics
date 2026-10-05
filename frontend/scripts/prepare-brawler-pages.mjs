import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export function validStats(value) {
  return !!value && ['score', 'win_rate', 'use_rate', 'total_matches'].every(key => Number.isFinite(value[key])) && Number.isInteger(value.total_matches) && value.total_matches >= 0 && value.use_rate >= 0 && value.use_rate <= 100 && value.win_rate >= 0 && value.win_rate <= 100 && typeof value.sample_sufficient === 'boolean'
}

export function validTier(value) {
  return !!value?.characters && !Array.isArray(value.characters) && !!value?.tiers && !Array.isArray(value.tiers) && Number.isFinite(value?.metrics?.analyzed_matches) &&
    Object.values(value.characters).every(validStats) && Object.values(value.tiers).every(names => Array.isArray(names) && names.every(name => validStats(value.characters[name])))
}

export async function fetchData(api, path, validate, fetcher = fetch) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetcher(new URL(path, api), { signal: AbortSignal.timeout(60000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      if (!validate(data)) throw new Error('Invalid response')
      return data
    } catch (error) {
      if (attempt === 2) throw new Error(`Cannot build character pages: ${path}: ${error.message}`)
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)))
    }
  }
}

export async function prepareBrawlerPages(api, directory) {
  if (!api) throw new Error('NEXT_PUBLIC_API_URL is required to build character pages')
  const catalog = await fetchData(api, '/meta/brawlers', data => Array.isArray(data?.brawlers) && data.brawlers.length > 0 && data.brawlers.every(row =>
    typeof row.name === 'string' && typeof row.nameJa === 'string' && typeof row.imageUrl === 'string' && /^https:\/\/cdn\.brawlify\.com\/.*\.png$/.test(row.imageUrl)))
  const snapshot = { overview: {}, details: {}, contexts: {}, contextUpdatedAt: {}, mapModes: {}, catalog: catalog.brawlers }
  const jobs = []
  for (const type of ['global', 'gachi']) {
    const overview = await fetchData(api, `/meta/tier-list?type=${type}&rank_tier=all`, validTier)
    if (!Object.values(overview.characters).some(stats => stats.total_matches > 0)) throw new Error(`Empty ${type} character data`)
    snapshot.overview[type] = overview
    snapshot.details[type] = {}
    snapshot.contexts[type] = { modes: {}, maps: {} }
    snapshot.contextUpdatedAt[type] = { modes: {}, maps: {} }
    const categories = await fetchData(api, `/meta/categories?type=${type}`, data =>
      Array.isArray(data?.modes) && Array.isArray(data?.maps) && [...data.modes, ...data.maps].every(id => typeof id === 'string') &&
      !!data.mode_to_maps && typeof data.mode_to_maps === 'object' && !Array.isArray(data.mode_to_maps) &&
      Object.values(data.mode_to_maps).every(maps => Array.isArray(maps) && maps.every(id => typeof id === 'string')))
    snapshot.mapModes[type] = {}
    for (const [mode, maps] of Object.entries(categories.mode_to_maps)) {
      for (const map of maps) {
        const modes = snapshot.mapModes[type][map] ||= []
        if (!modes.includes(mode)) modes.push(mode)
      }
    }
    for (const name of Object.keys(overview.characters).filter(name => overview.characters[name].total_matches > 0)) {
      jobs.push(async () => {
        snapshot.details[type][name] = await fetchData(api, `/meta/characters/${encodeURIComponent(name)}?type=${type}&rank_tier=all`, data =>
          validStats(data) && Array.isArray(data.kamo) && Array.isArray(data.tenteki) && !!data.synergies &&
          [...data.kamo, ...data.tenteki].every(pair => typeof pair.brawler === 'string' && Number.isFinite(pair.win_rate) && Number.isFinite(pair.matches)) &&
          Object.values(data.synergies).every(pair => Number.isFinite(pair.win_rate) && Number.isFinite(pair.matches) && Number.isFinite(pair.lift)))
      })
    }
    for (const [kind, ids] of [['mode', categories.modes], ['map', categories.maps]]) {
      for (const id of ids.filter(id => id !== 'unknown')) {
        jobs.push(async () => {
          const data = await fetchData(api, `/meta/tier-list?type=${type}&rank_tier=all&sub_type=${kind}&id=${encodeURIComponent(id)}`, validTier)
          snapshot.contexts[type][`${kind}s`][id] = data.characters
          snapshot.contextUpdatedAt[type][`${kind}s`][id] = data.updated_at
        })
      }
    }
  }
  // Character-scoped pair queries avoid the expensive all-character pair RPC.
  // Bound parallel requests to avoid overwhelming the existing API/database.
  let completed = 0
  async function worker() {
    while (jobs.length) {
      const job = jobs.shift()
      await job()
      completed++
      if (completed % 50 === 0) console.log(`Character snapshot: ${completed} requests completed`)
    }
  }
  await Promise.all([worker(), worker()])
  const target = resolve(directory, '.seo-data')
  await mkdir(target, { recursive: true })
  await writeFile(resolve(target, 'brawler-pages.json'), JSON.stringify(snapshot), 'utf8')
  console.log(`Character snapshot ready (${completed} requests)`)
}
