import { SITE_URL, searchCopy } from "./seo"

export const SITE_ID = `${SITE_URL}/#website`
export const PUBLISHER_ID = `${SITE_URL}/#publisher`
export const GAME_ID = `${SITE_URL}/#brawl-stars`
export const CATALOG_ID = `${SITE_URL}/data/catalog.jsonld#catalog`
export const LICENSE_URL = `${SITE_URL}/about#citation`
export const reference = (id: string) => ({ "@id": id })
export const catalogNode = () => ({
  "@type": "DataCatalog",
  "@id": CATALOG_ID,
  name: "ブロラボ対戦統計カタログ",
  url: `${SITE_URL}/data/catalog.jsonld`,
})
export function siteNodes() {
  return [
    {
      "@type": "Organization",
      "@id": PUBLISHER_ID,
      name: "ブロラボ",
      url: SITE_URL,
      logo: { "@type": "ImageObject", url: `${SITE_URL}/icon-512.png`, width: 512, height: 512 },
      description: "ブロスタ（Brawl Stars）の非公式対戦データ分析・攻略ツール「ブロラボ」の運営チーム",
      knowsAbout: ["ブロスタ", "Brawl Stars", "ガチバトル", "ゲームデータ分析"],
    },
    { "@type": "WebSite", "@id": SITE_ID, name: "ブロラボ", alternateName: ["Brawl Lab", "burolabo"], url: SITE_URL, inLanguage: "ja", publisher: reference(PUBLISHER_ID), about: reference(GAME_ID), hasPart: reference(CATALOG_ID) },
    { "@type": "WebApplication", "@id": `${SITE_URL}/#app`, name: "ブロラボ", alternateName: ["Brawl Lab", "burolabo"], url: SITE_URL, description: searchCopy.home.description, applicationCategory: "GameApplication", operatingSystem: "Web", offers: { "@type": "Offer", price: "0", priceCurrency: "JPY" }, inLanguage: "ja", image: `${SITE_URL}/icon-512.png`, publisher: reference(PUBLISHER_ID), isPartOf: reference(SITE_ID), about: reference(GAME_ID) },
    { "@type": "VideoGame", "@id": GAME_ID, name: "ブロスタ", alternateName: "Brawl Stars", sameAs: "https://supercell.com/en/games/brawlstars/" },
  ]
}
