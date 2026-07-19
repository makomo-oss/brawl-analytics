import httpx
req = httpx.Request('GET', 'https://api.brawlstars.com/v1/players/%23Q2LL9G8')
print("URL string:", req.url)
print("URL path:", req.url.path)
