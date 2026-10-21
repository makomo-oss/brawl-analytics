import type { AnchorHTMLAttributes } from "react"

// Real anchors work before hydration and in new tabs. The shared Pages router
// enhances supported clicks without requesting Next's RSC payload.
export default function DocumentLink({ prefetch, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) {
  void prefetch
  return <a {...props} />
}
