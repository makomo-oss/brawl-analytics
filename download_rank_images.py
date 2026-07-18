import os
import urllib.request

# Brawl Stars Wiki 等で公開されている安定した公式アセットの代替URL（CDN）
# 最新のランク画像（Ranked Icons）の直リンク
urls = {
    "Bronze": "https://static.wikia.nocookie.net/brawlstars/images/0/07/Ranked_Bronze_1.png",
    "Silver": "https://static.wikia.nocookie.net/brawlstars/images/0/0c/Ranked_Silver_1.png",
    "Gold": "https://static.wikia.nocookie.net/brawlstars/images/e/ef/Ranked_Gold_1.png",
    "Diamond": "https://static.wikia.nocookie.net/brawlstars/images/9/90/Ranked_Diamond_1.png",
    "Mythic": "https://static.wikia.nocookie.net/brawlstars/images/8/87/Ranked_Mythic_1.png",
    "Legendary": "https://static.wikia.nocookie.net/brawlstars/images/2/2f/Ranked_Legendary_1.png",
    "Masters": "https://static.wikia.nocookie.net/brawlstars/images/d/df/Ranked_Masters.png"
}

output_dir = "frontend/public/images/ranks"
os.makedirs(output_dir, exist_ok=True)

for name, url in urls.items():
    try:
        # Fandom CDNからの取得のためUser-Agentを偽装
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            content = response.read()
            if b"Error" not in content[:20]: # 簡易エラーチェック
                with open(os.path.join(output_dir, f"{name}.png"), "wb") as f:
                    f.write(content)
                print(f"Downloaded {name}")
            else:
                print(f"Failed to download {name}: invalid content")
    except Exception as e:
        print(f"Failed to download {name}: {e}")
