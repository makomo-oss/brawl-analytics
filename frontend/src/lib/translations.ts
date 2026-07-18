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
  "airHockey": "エアーホッケー",
  "brawlArena": "ブロウルアリーナ"
};

export function translateMode(modeName: string): string {
  return modeTranslations[modeName] || modeName;
}

export const mapTranslations: Record<string, string> = {
  // ガチバトル・汎用マップの代表例
  "Hard Rock Mine": "ごつごつ坑道",
  "Double Swoosh": "ダブルレール",
  "Minecart Madness": "トロッコ狂気",
  "Center Stage": "センターステージ",
  "Safe Zone": "安全地帯",
  "Hot Potato": "ホットポテト",
  "Kaboom Canyon": "どんぱち谷",
  "Shooting Star": "シューティングスター",
  "Canal Grande": "グランドカナル",
  "Excel": "エクセル",
  "Flaring Phoenix": "燃える不死鳥",
  "Hideout": "隠れ家",
  "Out in the Open": "開けた空き地",
  "Belle's Rock": "ベルの岩",
  "Dueling Beetles": "ビートルバトル",
  "Parallel Plays": "パラレルプレイ",
  "Ring of Fire": "炎のリング",
  "Open Zone": "オープンゾーン",
  "Center Control": "センターコントロール",
  "Backyard Bowl": "バックヤードボウル",
  "Sneaky Fields": "スニーキーフィールド",
  "Pinhole Punt": "ピンホールパント",
  "Super Beach": "スーパービーチ",
  "Beach Ball": "ビーチボール",
  "Goalkeeper's Dream": "キーパーの夢",
  "Retina": "網膜",
  "Bouncing Diner": "バウンシングダイナー",
  "Goldarm Gulch": "ゴールドアーム渓谷",
  "Split": "スプリット",
  "Pit Stop": "ピットストップ",
  "Bridge Too Far": "遠すぎる橋",
  "Gg Mortuary": "GGモチュアリー",
  "Crimson Water": "クリムゾンウォーター",
  "Layer Cake": "レイヤーケーキ",
  "Dry Season": "ドライシーズン",
  "Deadeye Derby": "デッドアイダービー",
  "Outlaw Camp": "アウトローキャンプ",
  "Snake Prairie": "スネーク草原",
  "Cavern Churn": "激動の洞窟",
  "Feast or Famine": "飢餓の盛宴",
  "Skull Creek": "スカル川",
  "Stormy Plains": "嵐の平野",
  "Rockwall Brawl": "ロックウォール対決",
  "Safety Center": "安全センター",
  "Acid Lakes": "酸の湖",
  "Double Trouble": "ダブルトラブル",
  // APIから取得される未登録のマップを追加
  "Rustic Arcade": "ラスティックアーケード",
  "Triple Dribble": "トリプルドリブル",
  "Safe(r) Zone": "より安全な地帯",
  "New Horizons": "ニューホライズン",
  "Undermine": "アンダーマイン",
  "Gem Fort": "エメラルドの砦",
  "Pinball Dreams": "ピンボールドリーム",
  "Open Business": "オープンビジネス",
  "Lilygear Lake": "リリーギアの湖",
  "Flooded Mine": "水没した鉱山",
  "No Excuses": "言い訳無用",
  "Crystal Clearing": "クリスタルクリアリング",
  "Nullscapes": "ナルスケープ",
  "Slippery Slap": "スリッパリースラップ",
  "Bouncy Bowl": "バウンシーボウル",
  "Controller Chaos": "コントローラーカオス",
  "Abracadabra": "アブラカダブラ",
  "Knockout Grounds": "ノックアウトグラウンド",
  "Triple-Double": "トリプルダブル",
  "Deep End": "ディープエンド",
  "Crescendo": "クレッシェンド",
  "Nutmeg": "ナツメグ"
};

export function translateMap(mapName: string): string {
  if (!mapName) return "";
  // 厳密一致がない場合、toLowerCaseや一部削除でマッチさせるなどの工夫も可能ですが、まずは直接マッチ
  return mapTranslations[mapName] || mapTranslations[mapName.trim()] || mapName;
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
