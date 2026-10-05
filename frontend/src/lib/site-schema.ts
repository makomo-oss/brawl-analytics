import { SITE_URL, searchCopy } from "./seo"

export const SITE_ID = `${SITE_URL}/#website`
export const PUBLISHER_ID = `${SITE_URL}/#publisher`
export const GAME_ID = `${SITE_URL}/#brawl-stars`
export const CATALOG_ID = `${SITE_URL}/data/catalog.jsonld#catalog`
export const reference = (id: string) => ({ "@id": id })
export function siteNodes() {
  return [
    { "@type": "Organization", "@id": PUBLISHER_ID, name: "ブロラボ", url: SITE_URL },
    { "@type": "WebSite", "@id": SITE_ID, name: "ブロラボ", alternateName: ["Brawl Lab", "burolabo"], url: SITE_URL, inLanguage: "ja", publisher: reference(PUBLISHER_ID), hasPart: reference(CATALOG_ID) },
    { "@type": "WebApplication", "@id": `${SITE_URL}/#app`, name: "ブロラボ", alternateName: ["Brawl Lab", "burolabo"], url: SITE_URL, description: searchCopy.home.description, applicationCategory: "GameApplication", operatingSystem: "Web", offers: { "@type": "Offer", price: "0", priceCurrency: "JPY" }, inLanguage: "ja", image: `${SITE_URL}/icon-512.png`, publisher: reference(PUBLISHER_ID), isPartOf: reference(SITE_ID), about: reference(GAME_ID) },
    { "@type": "VideoGame", "@id": GAME_ID, name: "ブロスタ", alternateName: "Brawl Stars", sameAs: "https://supercell.com/en/games/brawlstars/" },
  ]
}
