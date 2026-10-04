"use client"

import type { ReactNode } from "react"

type Props = {
  href?: string
  name: string
  className: string
  onPreview: () => void
  children: ReactNode
}

// Keep the quick preview while exposing the full analysis URL to crawlers,
// JavaScript-free navigation, and the browser's open-in-new-tab controls.
export function BrawlerPreviewLink({ href, name, className, onPreview, children }: Props) {
  const props = { className, "aria-label": `${name}の詳細`, "aria-haspopup": "dialog" as const }
  if (!href) return <button type="button" {...props} onClick={onPreview}>{children}</button>

  return <a href={href} {...props} onClick={event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    onPreview()
  }} onKeyDown={event => {
    if (event.key !== " " || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    onPreview()
  }}>{children}</a>
}
