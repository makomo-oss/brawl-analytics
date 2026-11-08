// Aggregate timestamps are UTC; older rows omit the zone suffix.
export const normalizeDate = (date: string | null | undefined) => {
  if (!date) return null
  const stamp = Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(date) ? date : `${date}Z`)
  return Number.isFinite(stamp) ? new Date(stamp).toISOString() : null
}

export interface JstDate { iso: string; long: string; short: string }

// Fixed +9h offset so server, Worker and browser render the same text.
export function jstDate(date: string | null | undefined): JstDate | null {
  const iso = normalizeDate(date)
  if (!iso) return null
  const jst = new Date(Date.parse(iso) + 9 * 60 * 60 * 1000)
  const month = jst.getUTCMonth() + 1
  const day = jst.getUTCDate()
  return { iso, long: `${jst.getUTCFullYear()}年${month}月${day}日`, short: `${month}/${day}` }
}
