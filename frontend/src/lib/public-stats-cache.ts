// Public aggregate statistics only. Player lookups and synchronization must
// never share this cache. Keep it bounded and retry failures on the next call.
const TTL = 5 * 60_000
const values = new Map<string, { data: unknown; expires: number }>()
const pending = new Map<string, Promise<unknown>>()

export async function fetchPublicStats<T = any>(url: string): Promise<T> {
  const parsed = new URL(url)
  if (!/^\/(?:api\/)?meta\/(tier-list|categories|characters\/[^/]+)$/.test(parsed.pathname)) throw new Error("Unsupported public statistics URL")
  parsed.searchParams.sort()
  const key = parsed.href
  const cached = values.get(key)
  if (cached && cached.expires > Date.now()) return structuredClone(cached.data) as T
  let request = pending.get(key)
  if (!request) {
    request = (async () => {
      const response = await fetch(url, { signal: AbortSignal.timeout(45_000) })
      if (!response.ok) throw new Error(`Statistics API returned ${response.status}`)
      const data: unknown = await response.json()
      values.delete(key)
      if (values.size >= 32) values.delete(values.keys().next().value!)
      values.set(key, { data, expires: Date.now() + TTL })
      return data
    })().finally(() => pending.delete(key))
    pending.set(key, request)
  }
  // Draft analysis adds mode scores; return a copy so it cannot mutate cached data.
  return structuredClone(await request) as T
}
