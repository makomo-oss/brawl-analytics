import { createContext, useContext } from "react"

export const RuntimePathname = createContext("/")
export function usePathname() { return useContext(RuntimePathname) }

// This renderer serves documents; its navigation must not request Next RSC.
const router = {
  push: (href: string) => window.location.assign(href),
  replace: (href: string) => window.location.replace(href),
}
export function useRouter() { return router }
