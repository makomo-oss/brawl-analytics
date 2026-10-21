import type { AnchorHTMLAttributes } from "react"

// Real anchors are progressively enhanced by the shared Pages router.
export default function Link({ prefetch: _prefetch, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) {
  void _prefetch
  return <a {...props} />
}
