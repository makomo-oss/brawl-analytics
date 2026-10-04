import { BRAWLER_MAP } from "./brawlers"

const normalize = (name: string) => name.toLowerCase().replace(/[\s_.&-]/g, "")

export function canonicalBrawlerName(name: string): string {
  return Object.keys(BRAWLER_MAP).find(key => normalize(key) === normalize(name)) || name.toLowerCase().trim()
}

export function brawlerSlug(name: string): string {
  return canonicalBrawlerName(name).replace(/&/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

export function brawlerPath(name: string): string {
  return `/brawlers/${brawlerSlug(name)}`
}
