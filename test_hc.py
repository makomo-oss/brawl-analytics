import requests

try:
    r = requests.get('https://api.brawlapi.com/v1/brawlers')
    if r.status_code == 200:
        brawlers = r.json().get('list', [])
        # ハイパーチャージを持っているキャラを探す
        for b in brawlers:
            hc = b.get("hyperCharge") # あるいは hyperCharges 等のキーかもしれないので全体を出力
            if hc:
                print(f"{b['name']} Hypercharge info:", hc)
                break
        else:
            print("No hypercharge info found in /v1/brawlers.")
except Exception as e:
    print(e)
