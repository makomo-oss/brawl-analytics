import type { AnchorHTMLAttributes } from "react"

// Pages runtime uses document navigation across the static/dynamic boundary.
export default function Link({ prefetch: _prefetch, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) {
  void _prefetch
  return <a {...props} />
}
