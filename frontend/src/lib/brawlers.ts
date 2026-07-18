export const BRAWLER_MAP: Record<string, { ja: string, id: string }> = {
  "shelly": { ja: "シェリー", id: "Shelly" },
  "nita": { ja: "ニタ", id: "Nita" },
  "colt": { ja: "コルト", id: "Colt" },
  "bull": { ja: "ブル", id: "Bull" },
  "brock": { ja: "ブロック", id: "Brock" },
  "el primo": { ja: "エル・プリモ", id: "El-Primo" },
  "barley": { ja: "バーリー", id: "Barley" },
  "poco": { ja: "ポコ", id: "Poco" },
  "rosa": { ja: "ローサ", id: "Rosa" },
  "jessie": { ja: "ジェシー", id: "Jessie" },
  "dynamike": { ja: "ダイナマイク", id: "Dynamike" },
  "tick": { ja: "ティック", id: "Tick" },
  "8-bit": { ja: "8ビット", id: "8-Bit" },
  "rico": { ja: "リコ", id: "Rico" },
  "darryl": { ja: "ダリル", id: "Darryl" },
  "penny": { ja: "ペニー", id: "Penny" },
  "carl": { ja: "カール", id: "Carl" },
  "jacky": { ja: "ジャッキー", id: "Jacky" },
  "piper": { ja: "エリザベス", id: "Piper" },
  "pam": { ja: "パム", id: "Pam" },
  "frank": { ja: "フランケン", id: "Frank" },
  "bibi": { ja: "ビビ", id: "Bibi" },
  "bea": { ja: "ビー", id: "Bea" },
  "nani": { ja: "ナーニ", id: "Nani" },
  "edgar": { ja: "エドガー", id: "Edgar" },
  "griff": { ja: "グリフ", id: "Griff" },
  "grom": { ja: "グロム", id: "Grom" },
  "bonnie": { ja: "ボニー", id: "Bonnie" },
  "mortis": { ja: "モーティス", id: "Mortis" },
  "tara": { ja: "タラ", id: "Tara" },
  "gene": { ja: "ジーン", id: "Gene" },
  "max": { ja: "マックス", id: "Max" },
  "mr. p": { ja: "ミスターP", id: "Mr-P" },
  "sprout": { ja: "スプラウト", id: "Sprout" },
  "byron": { ja: "バイロン", id: "Byron" },
  "squeak": { ja: "スクウィーク", id: "Squeak" },
  "spike": { ja: "スパイク", id: "Spike" },
  "crow": { ja: "クロウ", id: "Crow" },
  "leon": { ja: "レオン", id: "Leon" },
  "sandy": { ja: "サンディ", id: "Sandy" },
  "amber": { ja: "アンバー", id: "Amber" },
  "meg": { ja: "メグ", id: "Meg" },
  "surge": { ja: "サージ", id: "Surge" },
  "colette": { ja: "コレット", id: "Colette" },
  "lou": { ja: "ルー", id: "Lou" },
  "ruffs": { ja: "ラフス", id: "Ruffs" },
  "belle": { ja: "ベル", id: "Belle" },
  "buzz": { ja: "バズ", id: "Buzz" },
  "ash": { ja: "アッシュ", id: "Ash" },
  "lola": { ja: "ローラ", id: "Lola" },
  "fang": { ja: "ファング", id: "Fang" },
  "eve": { ja: "イヴ", id: "Eve" },
  "janet": { ja: "ジャネット", id: "Janet" },
  "otis": { ja: "オーティス", id: "Otis" },
  "sam": { ja: "サム", id: "Sam" },
  "buster": { ja: "バスター", id: "Buster" },
  "mandy": { ja: "マンディ", id: "Mandy" },
  "r-t": { ja: "R-T", id: "R-T" },
  "willow": { ja: "ウィロー", id: "Willow" },
  "maisie": { ja: "メイジー", id: "Maisie" },
  "hank": { ja: "ハンク", id: "Hank" },
  "cordelius": { ja: "コーデリアス", id: "Cordelius" },
  "doug": { ja: "ダグ", id: "Doug" },
  "pearl": { ja: "パール", id: "Pearl" },
  "chuck": { ja: "チャック", id: "Chuck" },
  "charlie": { ja: "チャーリー", id: "Charlie" },
  "mico": { ja: "ミコ", id: "Mico" },
  "kit": { ja: "キット", id: "Kit" },
  "larry & lawrie": { ja: "ラリー&ローリー", id: "Larry-Lawrie" },
  "melodie": { ja: "メロディー", id: "Melodie" },
  "angelo": { ja: "アンジェロ", id: "Angelo" },
  "lily": { ja: "リリー", id: "Lily" },
  "draco": { ja: "ドラコ", id: "Draco" },
  "berry": { ja: "ベリー", id: "Berry" },
  "clancy": { ja: "クランシー", id: "Clancy" },
}

export function getBrawlerInfo(name: string) {
  if (!name) return { nameJa: "Unknown", imageUrl: "" }
  const lowerName = name.toLowerCase()
  const info = BRAWLER_MAP[lowerName]
  if (info) {
    return {
      nameJa: info.ja,
      imageUrl: `https://cdn.brawlify.com/brawler/${info.id}.png`
    }
  }
  
  // マップにない場合のフォールバック
  const defaultId = name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-]/g, '')
  return {
    nameJa: name.charAt(0).toUpperCase() + name.slice(1),
    imageUrl: `https://cdn.brawlify.com/brawler/${defaultId}.png`
  }
}
