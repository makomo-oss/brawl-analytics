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
