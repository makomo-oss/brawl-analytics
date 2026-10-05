import type { AnchorHTMLAttributes } from "react"

// Live Pages routes return a complete document rather than Next's RSC payload.
export default function DocumentLink({ prefetch, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) {
  void prefetch
  return <a {...props} />
}
