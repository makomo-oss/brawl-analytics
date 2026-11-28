export const MAX_SCROLL_ENTRIES = 50
export const SCROLL_STORAGE_KEY = "arena:scroll-positions:v1"

export interface ScrollHistoryEnv {
  history: Pick<History, "state" | "pushState" | "replaceState">
  getScrollY: () => number
  storage?: Pick<Storage, "getItem" | "setItem"> | null
  createKey?: () => string
}

function normalizeScroll(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0
}

function readStateRecord(state: unknown): Record<string, unknown> {
  if (!state || typeof state !== "object" || Array.isArray(state)) return {}
  return { ...(state as Record<string, unknown>) }
}

function readEntryKey(state: unknown): string | null {
  if (!state || typeof state !== "object" || Array.isArray(state)) return null
  const key = (state as { arenaKey?: unknown }).arenaKey
  return typeof key === "string" && key.length > 0 ? key : null
}

function defaultStorage(): Pick<Storage, "getItem" | "setItem"> | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null
  } catch {
    return null
  }
}

/**
 * Tracks per-history-entry scroll offsets in memory without calling
 * history.replaceState during scroll events, avoiding iOS Safari's
 * 100 calls per 30 seconds History API SecurityError quota.
 */
export function createScrollHistory(overrides: Partial<ScrollHistoryEnv> = {}) {
  let counter = 0
  const history = overrides.history ?? window.history
  const getScrollY = overrides.getScrollY ?? (() => window.scrollY)
  const storage = overrides.storage !== undefined ? overrides.storage : defaultStorage()
  const createKey = overrides.createKey ?? (() => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID()
    }
    counter += 1
    return `arena-${Date.now()}-${counter}`
  })

  const positions = new Map<string, number>()
  const setPosition = (key: string, scroll: number) => {
    positions.delete(key)
    positions.set(key, scroll)
    if (positions.size > MAX_SCROLL_ENTRIES) {
      const oldest = positions.keys().next().value
      if (oldest !== undefined) positions.delete(oldest)
    }
  }

  try {
    const raw = storage?.getItem(SCROLL_STORAGE_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          if (
            Array.isArray(entry) &&
            entry.length === 2 &&
            typeof entry[0] === "string" &&
            entry[0].length > 0 &&
            typeof entry[1] === "number" &&
            Number.isFinite(entry[1]) &&
            entry[1] >= 0
          ) {
            setPosition(entry[0], entry[1])
          }
        }
      }
    }
  } catch {
    // Ignore unavailable or malformed sessionStorage data.
  }

  let currentKey = readEntryKey(history.state) ?? ""
  if (!currentKey) {
    currentKey = createKey()
    try {
      history.replaceState({ ...readStateRecord(history.state), arenaKey: currentKey }, "")
    } catch {
      // Initial tagging is best-effort; in-memory tracking still works.
    }
  }

  const recordScroll = () => {
    setPosition(currentKey, normalizeScroll(getScrollY()))
  }

  const commit = (mode: "push" | "replace", href: string): boolean => {
    recordScroll()
    if (mode === "push") {
      const nextKey = createKey()
      try {
        history.pushState({ arenaKey: nextKey }, "", href)
      } catch {
        return false
      }
      currentKey = nextKey
      setPosition(nextKey, 0)
      return true
    }

    try {
      history.replaceState({ ...readStateRecord(history.state), arenaKey: currentKey }, "", href)
    } catch {
      return false
    }
    setPosition(currentKey, 0)
    return true
  }

  const resolvePop = (state: unknown): number => {
    const targetKey = readEntryKey(state)
    const record = readStateRecord(state)
    if (targetKey) {
      if (targetKey !== currentKey) {
        recordScroll()
        currentKey = targetKey
      }
      return positions.has(targetKey) ? positions.get(targetKey)! : normalizeScroll(record.arenaScroll)
    }

    recordScroll()
    currentKey = createKey()
    return normalizeScroll(record.arenaScroll)
  }

  const persist = () => {
    recordScroll()
    const scroll = positions.get(currentKey) ?? 0
    try {
      storage?.setItem(SCROLL_STORAGE_KEY, JSON.stringify([...positions.entries()]))
    } catch {
      // Ignore storage quota or privacy-mode errors.
    }
    try {
      history.replaceState({ ...readStateRecord(history.state), arenaKey: currentKey, arenaScroll: scroll }, "")
    } catch {
      // Ignore History API quota or restriction errors.
    }
  }

  return { recordScroll, commit, resolvePop, persist }
}
