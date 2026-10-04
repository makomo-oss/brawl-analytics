import { createContext, useContext } from "react"

export const RuntimePathname = createContext("/")
export function usePathname() { return useContext(RuntimePathname) }
