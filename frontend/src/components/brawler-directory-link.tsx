import type { AnchorHTMLAttributes } from "react"

export function BrawlerDirectoryLink(props: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  // The shared Pages router enhances this anchor; direct/new-tab visits still
  // receive a complete character directory document.
  // eslint-disable-next-line @next/next/no-html-link-for-pages
  return <a href="/brawlers" {...props} />
}
