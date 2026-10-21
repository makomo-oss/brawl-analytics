import { createContext, useContext, useMemo } from "react"

export const RuntimePathname = createContext("/")
export function usePathname() { return useContext(RuntimePathname) }

export type Navigate = (href: string, mode?: "push" | "replace" | "pop") => void
export const RuntimeRouter = createContext<{ push: Navigate; replace: Navigate } | null>(null)
export const RuntimeHref = createContext("/")

// The Pages renderer uses its own document payload, never Next's RSC protocol.
const documentRouter = {
  push: (href: string) => window.location.assign(href),
  replace: (href: string) => window.location.replace(href),
}
export function useRouter() { return useContext(RuntimeRouter) || documentRouter }
export function useParams() { return {} as Record<string, string> }
export function useSearchParams() {
  const href = useContext(RuntimeHref)
  return useMemo(() => new URLSearchParams(href.split("?")[1]?.split("#")[0] || ""), [href])
}
