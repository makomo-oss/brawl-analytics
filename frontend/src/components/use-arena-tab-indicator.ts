"use client"

import { useLayoutEffect, useRef } from "react"
import { indicatorKeyframes } from "@/lib/arena-navigation-motion"

export function useArenaTabIndicator(pathname: string) {
  const navigation = useRef<HTMLElement>(null)
  const indicator = useRef<HTMLSpanElement>(null)
  const update = useRef<(animate: boolean) => void>(() => {})

  useLayoutEffect(() => {
    const nav = navigation.current, highlight = indicator.current
    if (!nav || !highlight) return
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)")
    let animation: Animation | null = null
    let lastBox = ""
    const position = (animate: boolean) => {
      const active = nav.querySelector<HTMLElement>('a[aria-current="page"]')
      if (!active || !nav.offsetWidth || !active.offsetWidth) {
        animation?.cancel()
        nav.removeAttribute("data-indicator-ready")
        lastBox = ""
        return
      }
      const inset = nav.classList.contains("arena-bottom-nav") ? 4 : 0
      const box = { x: active.offsetLeft + inset, y: active.offsetTop + inset,
        width: active.offsetWidth - inset * 2, height: active.offsetHeight - inset * 2 }
      const signature = JSON.stringify(box)
      // ResizeObserver's first delivery must not cancel a just-started glide.
      if (signature === lastBox) return
      const previous = nav.hasAttribute("data-indicator-ready") ? highlight.getBoundingClientRect() : null
      animation?.cancel()
      Object.assign(highlight.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${box.width}px`, height: `${box.height}px` })
      nav.setAttribute("data-indicator-ready", "")
      lastBox = signature
      if (!animate || !previous || preference.matches || typeof highlight.animate !== "function") return
      const frames = indicatorKeyframes(previous, highlight.getBoundingClientRect())
      if (frames) animation = highlight.animate(frames, { duration: 360, easing: "cubic-bezier(.22, 1, .36, 1)" })
    }
    update.current = position
    position(false)
    const onResize = () => position(false)
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(onResize) : null
    observer?.observe(nav)
    nav.querySelectorAll("a").forEach(link => observer?.observe(link))
    window.addEventListener("resize", onResize)
    const onPreference = () => { animation?.cancel(); position(false) }
    preference.addEventListener("change", onPreference)
    return () => {
      animation?.cancel()
      observer?.disconnect()
      window.removeEventListener("resize", onResize)
      preference.removeEventListener("change", onPreference)
      update.current = () => {}
    }
  }, [])

  useLayoutEffect(() => { update.current(true) }, [pathname])
  return { navigation, indicator }
}
