import type { AnchorHTMLAttributes } from "react"

export function BrawlerDirectoryLink(props: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  // Character pages run in Pages Functions, outside Next's static RSC router.
  // eslint-disable-next-line @next/next/no-html-link-for-pages
  return <a href="/brawlers" {...props} />
}
