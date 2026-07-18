import os
import urllib.request

output_dir = "frontend/public/images/ranks"
os.makedirs(output_dir, exist_ok=True)

# 1-19 までのランク画像をダウンロード
for i in range(1, 20):
    url = f"https://media.brawltime.ninja/ranks/{i}.png"
    try:
        # User-Agentを偽装
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
        with urllib.request.urlopen(req) as response:
            content = response.read()
            # 保存
            file_path = os.path.join(output_dir, f"{i}.png")
            with open(file_path, "wb") as f:
                f.write(content)
            print(f"Downloaded {i}.png")
    except Exception as e:
        print(f"Failed to download {i}.png from {url}: {e}")
