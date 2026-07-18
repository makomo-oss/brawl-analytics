export const MODE_MAP: Record<string, string> = {
  "gemGrab": "エメラルドハント",
  "gem grab": "エメラルドハント",
  "brawlBall": "ブロストライカー",
  "brawl ball": "ブロストライカー",
  "bounty": "バウンティ",
  "heist": "強奪",
  "hotZone": "ホットゾーン",
  "hot zone": "ホットゾーン",
  "knockout": "ノックアウト",
  "wipeout": "ワイプアウト",
  "soloShowdown": "ソロ・バトルロイヤル",
  "solo showdown": "ソロ・バトルロイヤル",
  "duoShowdown": "デュオ・バトルロイヤル",
  "duo showdown": "デュオ・バトルロイヤル",
  "duels": "デュエル",
  "basketBrawl": "バスケバスケット",
  "basket brawl": "バスケバスケット",
  "volleyBrawl": "バレーブロウル",
  "volley brawl": "バレーブロウル",
  "payload": "ペイロード",
  "hunters": "ハンター",
  "snowtelThieves": "スノーテル泥棒",
  "snowtel thieves": "スノーテル泥棒",
  "unknown": "不明"
}

export const MAP_MAP: Record<string, string> = {
  // 代表的なマップのみ翻訳、他はそのまま返す
  "Hard Rock Mine": "ごつごつ坑道",
  "Crystal Arcade": "クリスタルアーケード",
  "Undermine": "アンダーマイン",
  "Double Swoosh": "ダブルスウッシュ",
  "Deep Diner": "ディープダイナー",
  "Sneaky Fields": "スニーキーフィールド",
  "Backyard Bowl": "バックヤードボウル",
  "Center Stage": "センターステージ",
  "Super Stadium": "スーパースタジアム",
  "Pinball Dreams": "ピンボールドリーム",
  "Shooting Star": "シューティングスター",
  "Canal Grande": "グランドカナル",
  "Snake Prairie": "スネーク草原",
  "Excel": "エクセル",
  "Safe Zone": "安全地帯",
  "Hot Potato": "ホットポテト",
  "Kaboom Canyon": "カブームキャニオン",
  "Pit Stop": "ピットストップ",
  "Ring of Fire": "リング・オブ・ファイア",
  "Dueling Beetles": "ビートルバトル",
  "Parallel Plays": "パラレルプレイ",
  "Open Zone": "オープンゾーン",
  "Split": "スプリット",
  "Goldarm Gulch": "ゴールドアーム・ガルチ",
  "Flaring Phoenix": "燃える不死鳥",
  "Out in the Open": "オープンフィールド",
  "Belle's Rock": "ベルの岩",
  "X Marks the Spot": "Xマーク",
  "Skull Creek": "ガイコツ川",
  "Feast or Famine": "天国と地獄",
  "Double Trouble": "ダブルトラブル",
  "Rockwall Brawl": "ロックウォール・ブロウル",
  "Unknown": "不明"
}

export function translateMode(mode: string) {
  if (!mode) return "不明"
  return MODE_MAP[mode] || MODE_MAP[mode.toLowerCase()] || mode
}

export function translateMap(mapName: string) {
  if (!mapName) return "不明"
  return MAP_MAP[mapName] || mapName
}
