export const modeTranslations: Record<string, string> = {
  "brawlBall": "ブロストライカー",
  "brawlBall5V5": "ブロストライカー (5v5)",
  "gemGrab": "エメラルドハント",
  "gemGrab5V5": "エメラルドハント (5v5)",
  "heist": "強奪",
  "bounty": "賞金稼ぎ",
  "bounty5V5": "賞金稼ぎ (5v5)",
  "hotZone": "ホットゾーン",
  "knockout": "ノックアウト",
  "knockout5V5": "ノックアウト (5v5)",
  "wipeout": "ワイプアウト",
  "wipeout5V5": "ワイプアウト (5v5)",
  "soloShowdown": "ソロ バトルロイヤル",
  "duoShowdown": "デュオ バトルロイヤル",
  "duels": "デュエル",
  "basketBrawl": "バスケブロ",
  "volleyBrawl": "バレーブロ",
  "hunters": "ハンター",
  "paintBrawl": "ペイントブロ",
  "payload": "ペイロード",
  "siege": "制圧",
  "takedown": "テイクダウン",
  "lonestar": "ローンスター",
  "presentPlunder": "プレゼント泥棒",
  "snowtelThieves": "スノーテル泥棒",
  "superCityRampage": "スーパーシティ乱闘",
  "bossFight": "ボスファイト",
  "roboRumble": "ロボットファクトリー",
  "bigGame": "ビッグゲーム",
  "pumpkinPlunder": "パンプキン泥棒",
  "unknown": "不明",
  "airHockey": "エアーホッケー"
};

export function translateMode(modeName: string): string {
  return modeTranslations[modeName] || modeName;
}

export function translateMap(mapName: string): string {
  return mapName;
}

export function getModeIconUrl(mode: string) {
  if (!mode) return ""
  const normalizedMode = mode.replace(/[\s\-_]/g, '').toLowerCase()
  
  const MODE_ICON_MAP: Record<string, string> = {
    "gemgrab": "48000000",
    "heist": "48000002",
    "bounty": "48000003",
    "brawlball": "48000005",
    "soloshowdown": "48000006",
    "duoshowdown": "48000009",
    "hotzone": "48000017",
    "knockout": "48000020",
    "basketbrawl": "48000022",
    "volleybrawl": "48000023",
    "duels": "48000024",
    "wipeout": "48000025",
    "payload": "48000026",
    "hunters": "48000028",
    "wipeout5v5": "48000031",
    "brawlball5v5": "48000032",
    "gemgrab5v5": "48000033",
    "knockout5v5": "48000035",
    "paintbrawl": "48000037",
    "drumroll": "48000039"
  }
  
  const iconId = MODE_ICON_MAP[normalizedMode] || "48000000"
  return `https://cdn.brawlify.com/game-modes/regular/${iconId}.png`
}
