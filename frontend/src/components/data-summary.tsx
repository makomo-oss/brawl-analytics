import type { ContentSummary } from "@/lib/page-insights"

// One short, data-derived paragraph. Renders nothing without valid data.
// Every summary starts with its aggregation date, marked up as <time>.
export function DataSummary({ summary, className = "" }: { summary: ContentSummary | null; className?: string }) {
  if (!summary) return null
  const { date, text } = summary
  const dated = text.startsWith(date.long)
  return <p data-summary="" className={`text-sm leading-relaxed text-muted-foreground break-words ${className}`}>
    {dated ? <><time dateTime={date.iso}>{date.long}</time>{text.slice(date.long.length)}</> : text}
  </p>
}
