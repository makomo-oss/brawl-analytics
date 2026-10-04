import type { ImgHTMLAttributes } from "react"

export default function Image({ priority, alt = "", ...props }: ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) {
  // The existing app already serves unoptimized CDN images; preserve that here.
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt={alt} decoding="async" loading={priority ? "eager" : "lazy"} {...props} />
}
