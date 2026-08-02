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
  "trioShowdown": "トリオ バトルロイヤル",
  "trio_showdown": "トリオ バトルロイヤル",
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
  if (!modeName) return "不明";
  if (modeTranslations[modeName]) return modeTranslations[modeName];
  
  // キャメルケース化/スネークケース正規化マッピング
  const cleanKey = modeName.replace(/[\s_\-]/g, "").toLowerCase();
  for (const [k, v] of Object.entries(modeTranslations)) {
    if (k.toLowerCase() === cleanKey) return v;
  }
  
  return modeName;
}

export const mapTranslations: Record<string, string> = {
  // エメラルドハント (Gem Grab)
  "Hard Rock Mine": "ごつごつ坑道",
  "Double Swoosh": "ダブルレール",
  "Minecart Madness": "トロッコの狂気",
  "Undermine": "アンダーマイン",
  "Gem Fort": "エメラルドの砦",
  "Rustic Arcade": "ラスティックアーケード",
  "Bouncing Diner": "バウンシングダイナー",
  "Flooded Mine": "水没鉱山",
  "Crystal Clearing": "クリスタルクリアリング",
  "Deathcap Cave": "キノコ洞窟",
  "Ice Fort": "氷の砦",
  "Stone Fort": "石の砦",
  "Deep Diner": "ディープダイナー",

  // ブロストライカー (Brawl Ball)
  "Center Stage": "センターステージ",
  "Backyard Bowl": "バックヤードボウル",
  "Sneaky Fields": "スニーキーフィールド",
  "Pinhole Punt": "ピンホールパント",
  "Super Beach": "スーパービーチ",
  "Beach Ball": "ビーチボール",
  "Goalkeeper's Dream": "キーパーの夢",
  "Retina": "レティーナ",
  "Triple Dribble": "トリプルドリブル",
  "Penalty Kick": "ペナルティキック",
  "Galaxy Arena": "ギャラクシーアリーナ",
  "Sunny Soccer": "サニーサッカー",
  "Super Stadium": "スーパースタジアム",
  "Winter Party": "ウィンターパーティー",

  // 強奪 (Heist)
  "Safe Zone": "安全地帯",
  "Hot Potato": "アツアツポテト",
  "Kaboom Canyon": "どんぱち谷",
  "Gg Mortuary": "G.G.モチュアリー",
  "G.G. Mortuary": "G.G.モチュアリー",
  "Pit Stop": "ピットストップ",
  "Bridge Too Far": "遠すぎる橋",
  "Tornado Ring": "トルネードリング",
  "Safe(r) Zone": "安全地帯(改)",

  // 賞金稼ぎ (Bounty)
  "Shooting Star": "シューティングスター",
  "Canal Grande": "グランドカナル",
  "Excel": "エクセル",
  "Flaring Phoenix": "燃え盛る不死鳥",
  "Hideout": "隠れ家",
  "Layer Cake": "レイヤーケーキ",
  "Dry Season": "ドライシーズン",
  "Deadeye Derby": "デッドアイダービー",
  "Snake Prairie": "スネーク草原",
  "Overgrown Oasis": "緑のオアシス",

  // ホットゾーン (Hot Zone)
  "Dueling Beetles": "ビートルバトル",
  "Parallel Plays": "パラレルプレイ",
  "Ring of Fire": "炎のリング",
  "Open Zone": "オープンゾーン",
  "Center Control": "センターコントロール",
  "Split": "スプリット",
  "Controller Chaos": "コントローラーカオス",
  "Quarter Pounder": "クォーターパウンダー",

  // ノックアウト (Knockout)
  "Out in the Open": "開けた空き地",
  "Belle's Rock": "ベルの岩",
  "Goldarm Gulch": "ゴールドアーム渓谷",
  "Crimson Water": "クリムゾンウォーター",
  "New Horizons": "ニューホライズン",
  "Deep End": "ディープエンド",
  "Flaring Phoenix (Knockout)": "燃え盛る不死鳥",
  "X Marks the Spot": "Xマーク",
  "Bouncy Bowl": "バウンシーボウル",
  "Knockout Grounds": "ノックアウトグラウンド",

  // バトルロイヤル (Showdown)
  "Cavern Churn": "激動の洞窟",
  "Feast or Famine": "天国と地獄",
  "Skull Creek": "スカル川",
  "Stormy Plains": "嵐の平野",
  "Rockwall Brawl": "ロックウォール対決",
  "Safety Center": "安全センター",
  "Acid Lakes": "酸の湖",
  "Double Trouble": "ダブルトラブル",
  "Mined Out": "地雷原",
  "Outlaw Camp": "アウトローキャンプ",
  "Crossroads": "クロスロード",

  // その他 (Misc / 5v5 / Events)
  "Pinball Dreams": "ピンボールドリーム",
  "Open Business": "オープンビジネス",
  "Lilygear Lake": "リリーギアの湖",
  "No Excuses": "言い訳無用",
  "Nullscapes": "ナルスケープ",
  "Slippery Slap": "スリッパリースラップ",
  "Abracadabra": "アブラカダブラ",
  "Triple-Double": "トリプルダブル",
  "Crescendo": "クレッシェンド",
  "Nutmeg": "ナツメグ",
  "Snake Pit": "スネークピット",
  "Arabesque": "アラベスク",
  "Infinite Doom": "インフィニットドゥーム",
  "Kaiju Lake": "怪獣の湖",
  "Choral Chambers": "コラールチェンバー",
  "Double Decker": "ダブルデッカー",
  "Stardust Storm": "スターダストストーム",
  "Aridity": "アリディティ",
  "Goalies": "ゴーリーズ",
  "Ancestral Roots": "アンセストラルルーツ",
  "Call of the Water": "水の呼び声",
  "Hello Always Ends With a Goodbye": "出逢いと別れ",
  "Ball Hog": "ボールホッグ",
  "Golden Bay": "ゴールデンベイ",
  "Below Zero": "氷点下",
  "Cabin Fever": "キャビンフィーバー",
  "Broiler Room": "ボイラールーム",
  "Chivalry": "シヴァルリー",
  "Fortress Fall": "フォートレスフォール",
  "Crab Claws": "クラブクロウ",
  "Departure": "旅立ち",
  "Frosty tracks": "フロスティトラック",
  "Bottom Two": "ボトムツー",
  "Litterbug Lane": "ポイ捨てレーン",
  "Flowing Springs": "流れる泉",
  "Between the Rivers": "川のあいま",
  "Arena of Glory": "栄光のアリーナ",
  "Bustling Business": "繁盛するビジネス",
  "Healthy Middle Ground": "健やかな中間地帯",
  "Attrition": "アトリション"
};

const lowerCaseMapTranslations: Record<string, string> = {};
for (const [key, value] of Object.entries(mapTranslations)) {
  lowerCaseMapTranslations[key.toLowerCase()] = value;
}

export function translateMap(mapName: string): string {
  if (!mapName) return "";
  const name = mapName.trim();
  
  if (mapTranslations[name]) return mapTranslations[name];
  
  const lowerName = name.toLowerCase();
  if (lowerCaseMapTranslations[lowerName]) return lowerCaseMapTranslations[lowerName];
  
  return name;
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
    "trioshowdown": "48000038",
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
  
  let iconId = MODE_ICON_MAP[normalizedMode]
  if (!iconId) {
    if (normalizedMode.includes("showdown")) {
      iconId = "48000038" // Trio/Showdown fallback
    } else {
      iconId = "48000000" // General fallback
    }
  }
  
  return `https://cdn.brawlify.com/game-modes/regular/${iconId}.png`
}
