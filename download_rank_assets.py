import requests
import os

# Fandomの画像のRaw URLを使用する
# 以下のURLリストはFandom等の公開画像から手動で取得・予測したURLです。
# ただし403を防ぐため、Raw画像アップロードサイト（例えばimgurなど）や
# Githubのrawリンクを使用します。
# Statscell/brawl-assets リポジトリを使用してみる

base_url = "https://raw.githubusercontent.com/Statscell/Brawl-Assets-V2/main/assets/ranked/"

# ranksディレクトリ作成
out_dir = r"c:\MyFolder\projects\brawl-analytics\frontend\public\images\ranks"
os.makedirs(out_dir, exist_ok=True)

# 1から19まで試す
for i in range(1, 20):
    url = f"{base_url}{i}.png"
    try:
        r = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
        if r.status_code == 200:
            file_path = os.path.join(out_dir, f"{i}.png")
            with open(file_path, "wb") as f:
                f.write(r.content)
            print(f"Downloaded {i}.png ({len(r.content)} bytes)")
        else:
            print(f"Failed {i}.png: {r.status_code}")
    except Exception as e:
        print(f"Error {i}.png: {e}")
