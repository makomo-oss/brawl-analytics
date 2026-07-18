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
  // ハイフンやアンダースコア、空白を削除して小文字にしてから比較
  const normalizedMode = mode.replace(/[\s\-_]/g, '').toLowerCase()
  
  // normalized map
  const NORMALIZED_MODE_MAP: Record<string, string> = {
    "gemgrab": "エメラルドハント",
    "brawlball": "ブロストライカー",
    "bounty": "バウンティ",
    "heist": "強奪",
    "hotzone": "ホットゾーン",
    "knockout": "ノックアウト",
    "wipeout": "ワイプアウト",
    "soloshowdown": "ソロ・バトルロイヤル",
    "duoshowdown": "デュオ・バトルロイヤル",
    "duels": "デュエル",
    "basketbrawl": "バスケバスケット",
    "volleybrawl": "バレーブロウル",
    "payload": "ペイロード",
    "hunters": "ハンター",
    "snowtelthieves": "スノーテル泥棒",
  }
  
  return NORMALIZED_MODE_MAP[normalizedMode] || mode
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
  }
  
  const iconId = MODE_ICON_MAP[normalizedMode] || "48000000" // default fallback
  return `https://cdn.brawlify.com/game-modes/regular/${iconId}.png`
}

export function getRankInfo(rankValue: number) {
  let rankName = "Bronze";
  if (rankValue >= 4 && rankValue <= 6) rankName = "Silver";
  else if (rankValue >= 7 && rankValue <= 9) rankName = "Gold";
  else if (rankValue >= 10 && rankValue <= 12) rankName = "Diamond";
  else if (rankValue >= 13 && rankValue <= 15) rankName = "Mythic";
  else if (rankValue >= 16 && rankValue <= 18) rankName = "Legendary";
  else if (rankValue >= 19) rankName = "Masters";
  
  return {
    name: rankName,
    url: `https://media.brawltime.ninja/ranks/${rankValue}.png`
  };
}

export function translateMap(mapName: string) {
  if (!mapName) return "不明"
  const normalizedMapName = mapName.replace(/[\s\-_]/g, '').toLowerCase()
  
  const NORMALIZED_MAP_MAP: Record<string, string> = {
    "hardrockmine": "ごつごつ坑道",
    "crystalarcade": "クリスタルアーケード",
    "undermine": "アンダーマイン",
    "doubleswoosh": "ダブルスウッシュ",
    "deepdiner": "ディープダイナー",
    "sneakyfields": "スニーキーフィールド",
    "backyardbowl": "バックヤードボウル",
    "centerstage": "センターステージ",
    "superstadium": "スーパースタジアム",
    "pinballdreams": "ピンボールドリーム",
    "shootingstar": "シューティングスター",
    "canalgrande": "グランドカナル",
    "snakeprairie": "スネーク草原",
    "excel": "エクセル",
    "safezone": "安全地帯",
    "hotpotato": "ホットポテト",
    "kaboomcanyon": "カブームキャニオン",
    "pitstop": "ピットストップ",
    "ringoffire": "リング・オブ・ファイア",
    "duelingbeetles": "ビートルバトル",
    "parallelplays": "パラレルプレイ",
    "openzone": "オープンゾーン",
    "split": "スプリット",
    "goldarmgulch": "ゴールドアーム・ガルチ",
    "flaringphoenix": "燃える不死鳥",
    "outintheopen": "オープンフィールド",
    "bellesrock": "ベルの岩",
    "xmarksthespot": "Xマーク",
    "skullcreek": "ガイコツ川",
    "feastorfamine": "天国と地獄",
    "doubletrouble": "ダブルトラブル",
    "rockwallbrawl": "ロックウォール・ブロウル"
  }
  
  return NORMALIZED_MAP_MAP[normalizedMapName] || mapName
}
