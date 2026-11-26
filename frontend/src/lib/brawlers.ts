import catalogSeed from "./brawler-catalog.json"

export interface BrawlerRarity { id: number; name: string }

// Legacy/limited-time entries absent from the active catalog seed.
// Active brawlers are populated automatically from brawler-catalog.json and refreshed live from /meta/brawlers.
export const BRAWLER_MAP: Record<string, { ja: string, imageUrl: string, rarity?: BrawlerRarity | null }> = {
  "buzz lightyear": { ja: "バズ・ライトイヤー", imageUrl: "https://cdn.brawlify.com/brawlers/borders/16000088.png" },
}

// Bundled last-known data is immediately available, including when offline.
for (const row of catalogSeed) {
  BRAWLER_MAP[row.name.toLowerCase()] = { ja: row.nameJa, imageUrl: row.imageUrl, rarity: row.rarity }
}

export function getBrawlerRarity(name: string): BrawlerRarity | null {
  return BRAWLER_MAP[name.trim().toLowerCase()]?.rarity || null
}

export function getBrawlerInfo(name: unknown): { nameJa: string; imageUrl: string } {
  if (!name || typeof name !== 'string') {
    return { nameJa: "Unknown", imageUrl: "" };
  }
  const trimmed = name.trim();
  if (!trimmed) {
    return { nameJa: "Unknown", imageUrl: "" };
  }
  
  const lowerName = trimmed.toLowerCase();
  const info = BRAWLER_MAP[lowerName];
  if (info) {
    return {
      nameJa: info.ja || trimmed,
      imageUrl: info.imageUrl || ""
    };
  }
  
  // 未掲載のキャラは元の名前を表示し、画像はAvatar側の代替表示に任せる。
  const capitalized = trimmed.length > 0 ? (Array.from(trimmed)[0] || "").toUpperCase() + Array.from(trimmed).slice(1).join('') : trimmed;
  return {
    nameJa: capitalized || trimmed,
    imageUrl: ""
  };
}

/**
 * ガチバトルのランク数値（1〜19）からランク名・バッジ画像URL・サブティア（I, II, III）を取得する共通関数
 */
export function getRankImage(rankValue: unknown): { name: string; url: string; tier: string } | null {
  try {
    const num = Number(rankValue);
    if (isNaN(num) || num <= 0) return null;
    if (num >= 19) return { name: "マスター", url: "https://cdn.brawlify.com/ranked/regular/Masters.png", tier: "" };
    
    const tiers = ["Bronze", "Silver", "Gold", "Diamond", "Mythic", "Legendary"];
    const tierNames: Record<string, string> = {
      "Bronze": "ブロンズ",
      "Silver": "シルバー",
      "Gold": "ゴールド",
      "Diamond": "ダイヤモンド",
      "Mythic": "ミシック",
      "Legendary": "レジェンド"
    };
    
    const tierIndex = Math.floor((num - 1) / 3);
    if (tierIndex < 0 || tierIndex >= tiers.length || !tiers[tierIndex]) {
      return null;
    }
    
    const subTier = ((num - 1) % 3) + 1; // 1, 2, 3
    const numerals = ["I", "II", "III"];
    const rawTierName = tiers[tierIndex];
    
    return {
      name: tierNames[rawTierName] || rawTierName.toUpperCase(),
      url: `https://cdn.brawlify.com/ranked/regular/${rawTierName}.png`,
      tier: numerals[subTier - 1] || ""
    };
  } catch {
    return null;
  }
}
