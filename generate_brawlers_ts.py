import json
import os

existing_ja = {
  "shelly": "シェリー", "nita": "ニタ", "colt": "コルト", "bull": "ブル", "brock": "ブロック",
  "el primo": "エル・プリモ", "barley": "バーリー", "poco": "ポコ", "rosa": "ローサ", "jessie": "ジェシー",
  "dynamike": "ダイナマイク", "tick": "ティック", "8-bit": "8ビット", "rico": "リコ", "darryl": "ダリル",
  "penny": "ペニー", "carl": "カール", "jacky": "ジャッキー", "piper": "エリザベス", "pam": "パム",
  "frank": "フランケン", "bibi": "ビビ", "bea": "ビー", "nani": "ナーニ", "edgar": "エドガー",
  "griff": "グリフ", "grom": "グロム", "bonnie": "ボニー", "mortis": "モーティス", "tara": "タラ",
  "gene": "ジーン", "max": "マックス", "mr. p": "ミスターP", "sprout": "スプラウト", "byron": "バイロン",
  "squeak": "スクウィーク", "spike": "スパイク", "crow": "クロウ", "leon": "レオン", "sandy": "サンディ",
  "amber": "アンバー", "meg": "メグ", "surge": "サージ", "colette": "コレット", "lou": "ルー",
  "ruffs": "ラフス", "belle": "ベル", "buzz": "バズ", "ash": "アッシュ", "lola": "ローラ",
  "fang": "ファング", "eve": "イヴ", "janet": "ジャネット", "otis": "オーティス", "sam": "サム",
  "buster": "バスター", "mandy": "マンディ", "r-t": "R-T", "willow": "ウィロー", "maisie": "メイジー",
  "hank": "ハンク", "cordelius": "コーデリアス", "doug": "ダグ", "pearl": "パール", "chuck": "チャック",
  "charlie": "チャーリー", "mico": "ミコ", "kit": "キット", "larry & lawrie": "ラリー&ローリー", "melodie": "メロディー",
  "angelo": "アンジェロ", "lily": "リリー", "draco": "ドラコ", "berry": "ベリー", "clancy": "クランシー",
  "moe": "モー", "juju": "ジュジュ", "shade": "シェイド", "kenji": "ケンジ", "gale": "ゲイル", "stu": "ストゥー", "bo": "ボウ",
  "emz": "エムズ", "chester": "チェスター", "mandy": "マンディ", "grom": "グロム"
}

with open('brawler_api_data.json', 'r', encoding='utf-8') as f:
    api_data = json.load(f)

lines = []
lines.append("export const BRAWLER_MAP: Record<string, { ja: string, imageUrl: string }> = {")
for key, val in api_data.items():
    ja_name = existing_ja.get(key, val['id'])
    img = val['image']
    # If imageUrl is empty, construct a fallback
    if not img:
        clean_id = val['id'].replace(' ', '-').replace('.', '').replace('&', '-')
        img = f"https://cdn.brawlify.com/brawler/{clean_id}.png"
    
    # 既存の "el primo" は "el-primo" などAPI側でハイフンになっているかもしれない。APIのキーを使う
    lines.append(f'  "{key}": {{ ja: "{ja_name}", imageUrl: "{img}" }},')

# Add explicit el primo if api uses different key
if "el primo" not in api_data:
    lines.append('  "el primo": { ja: "エル・プリモ", imageUrl: "https://cdn.brawlify.com/brawler/El-Primo.png" },')

lines.append("}")

lines.append("""
export function getBrawlerInfo(name: string) {
  if (!name) return { nameJa: "Unknown", imageUrl: "" }
  const lowerName = name.toLowerCase()
  const info = BRAWLER_MAP[lowerName]
  if (info) {
    return {
      nameJa: info.ja,
      imageUrl: info.imageUrl
    }
  }
  
  // マップにない場合のフォールバック
  const defaultId = name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-]/g, '')
  return {
    nameJa: name.charAt(0).toUpperCase() + name.slice(1),
    imageUrl: `https://cdn.brawlify.com/brawler/${defaultId}.png`
  }
}
""")

with open('frontend/src/lib/brawlers.ts', 'w', encoding='utf-8') as f:
    f.write("\n".join(lines))
    
print("Generated frontend/src/lib/brawlers.ts successfully.")
