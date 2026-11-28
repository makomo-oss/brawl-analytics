import { MainNav } from "@/components/main-nav"
import BrawlerDetailView from "@/app/brawlers/brawler-detail-view"
import BrawlerDirectoryView from "@/app/brawlers/brawler-directory-view"
import { Activity, startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { RuntimeHref, RuntimePathname, RuntimeRouter, type Navigate } from "./navigation"
import { ConditionDirectoryView, ConditionDetailView } from "@/components/condition-pages"
import type { PublicPage } from "@/lib/llm-data"
import HomeView from "@/app/home-view"
import TierView from "@/app/tier/tier-view"
import type { TierListData } from "@/lib/tier-data"
import type { InitialMatchups } from "@/lib/matchup-preview"
import PlayerView from "@/app/player/player-view"
import { PlayerFaq, PlayerHeader } from "@/app/player/player-intro"
import AboutView from "@/app/about/about-view"
import ContactView from "@/app/contact/contact-view"
import { SiteFooter } from "@/components/site-footer"
import DraftCompanionPage from "@/app/companion/companion-view"
import type { DraftCategories } from "@/lib/draft-categories"
import { createRouteLoader, isRuntimePath, type RouteDocument } from "./route-loader"
import { createScrollHistory } from "./scroll-history"
import { navigationDirection } from "@/lib/arena-navigation-motion"
import type { BrawlerSnapshot } from "@/lib/brawler-page-data"
import { applyBrawlerCatalog } from "@/lib/use-brawler-catalog"

export type OverviewPage = ({ kind: "home"; path: "/" } | { kind: "tier"; path: "/tier" }) & {
  tierData: TierListData
  gachiTierData?: TierListData
  initialMatchups: InitialMatchups
  catalog?: BrawlerSnapshot["catalog"]
}
export type ToolPage = { kind: "player"; path: "/player" } | { kind: "about"; path: "/about" } | { kind: "contact"; path: "/contact" } | { kind: "companion"; path: "/companion"; categories: DraftCategories }
export type RuntimePage = PublicPage | OverviewPage | ToolPage

function PageView({ page, href }: { page: RuntimePage; href: string }) {
  if (page.kind === "player") return <>
    <PlayerHeader />
    <PlayerView defaultTag={new URL(href, "https://brawl-lab.sozai-hub.com").searchParams.get("tag") || ""} />
    <PlayerFaq />
  </>
  if (page.kind === "about") return <AboutView />
  if (page.kind === "contact") return <ContactView />
  if (page.kind === "companion") return <DraftCompanionPage initialCategories={page.categories} />
  return page.kind === "home" ? <HomeView initialTierData={page.tierData} initialMatchups={page.initialMatchups} /> : page.kind === "tier" ? <TierView initialTierData={page.tierData} initialGachiTierData={page.gachiTierData} initialMatchups={page.initialMatchups} /> : page.kind === "detail" ? <BrawlerDetailView data={page.data} /> : page.kind === "directory" ? <BrawlerDirectoryView entries={page.entries} /> : page.kind === "condition" ? <ConditionDetailView data={page.data} /> : <ConditionDirectoryView index={page.index} kind={page.category} />
}

const primaryPaths = new Set(["/", "/player", "/tier", "/brawlers", "/companion"])
type Visit = { page: RuntimePage; href: string }

function updateDocumentHead(html: string) {
  const source = new DOMParser().parseFromString(html, "text/html")
  // Only replace our metadata. Styles, runtime scripts and the app root persist.
  const selector = 'title, meta[name="description"], meta[name="robots"], meta[name^="twitter:"], meta[property^="og:"], link[rel="canonical"], link[rel="alternate"], link[rel="describedby"], script[type="application/ld+json"]'
  document.head.querySelectorAll(selector).forEach(node => node.remove())
  source.head.querySelectorAll(selector).forEach(node => document.head.appendChild(document.importNode(node, true)))
}

export function App({ page }: { page: RuntimePage }) {
  // Apply server-provided live catalog synchronously so SSR and initial hydration agree.
  if ("catalog" in page && Array.isArray(page.catalog)) {
    applyBrawlerCatalog({ brawlers: page.catalog }, { notify: false })
  }
  const [current, setCurrent] = useState<Visit>({ page, href: page.path })
  const [visits, setVisits] = useState<Visit[]>([{ page, href: page.path }])
  const [pending, setPending] = useState<string | null>(null)
  const [failure, setFailure] = useState<{ href: string; mode: "push" | "replace" | "pop" } | null>(null)
  const [revision, setRevision] = useState(0)
  const [direction, setDirection] = useState<ReturnType<typeof navigationDirection>>("none")
  const displayedPath = useRef(page.path)
  const sequence = useRef(0)
  const restore = useRef<{ scroll: number; hash: string } | null>(null)
  const navigate = useRef<Navigate>((href, mode) => mode === "replace" ? window.location.replace(href) : window.location.assign(href))
  const loader = useMemo(() => createRouteLoader(), [])
  const router = useMemo(() => ({ push: (href: string) => navigate.current(href, "push"), replace: (href: string) => navigate.current(href, "replace") }), [])

  useLayoutEffect(() => {
    displayedPath.current = current.page.path
    const target = restore.current
    if (!target) return
    restore.current = null
    document.getElementById("main-content")?.focus({ preventScroll: true })
    let anchor: HTMLElement | null = null
    try { if (target.hash) anchor = document.getElementById(decodeURIComponent(target.hash.slice(1))) } catch { /* A malformed fragment still navigates to the page. */ }
    if (anchor) anchor.scrollIntoView({ behavior: "instant" })
    else window.scrollTo({ top: target.scroll, left: 0, behavior: "instant" })
  }, [revision, current.page.path])

  useEffect(() => {
    const originalRestoration = history.scrollRestoration
    history.scrollRestoration = "manual"
    const scrollHistory = createScrollHistory()
    // Keep server HTML deterministic; read deep-link query parameters on mount.
    const initialHref = location.pathname + location.search + location.hash
    setCurrent({ page, href: initialHref })
    setVisits([{ page, href: initialHref }])
    let scrollFrame = 0
    const onScroll = () => {
      if (!scrollFrame) scrollFrame = requestAnimationFrame(() => { scrollFrame = 0; scrollHistory.recordScroll() })
    }
    const onPageHide = () => scrollHistory.persist()
    const perform = async (href: string, mode: "push" | "replace" | "pop" = "push", scroll = 0) => {
      const url = new URL(href, location.href)
      if (url.origin !== location.origin || !isRuntimePath(url.pathname)) {
        if (mode === "replace") location.replace(url.href)
        else location.assign(url.href)
        return
      }
      const id = ++sequence.current
      setFailure(null)
      const nextHref = url.pathname + url.search + url.hash
      if (mode !== "pop" && nextHref === location.pathname + location.search + location.hash) { setPending(null); return }
      setPending(url.pathname)
      let routeDocument: RouteDocument
      try {
        routeDocument = await loader.load(url.pathname)
      } catch {
        if (id === sequence.current) { setPending(null); setFailure({ href: nextHref, mode }) }
        return
      }
      if (id !== sequence.current) return
      if (mode !== "pop" && !scrollHistory.commit(mode, nextHref)) {
        if (mode === "replace") location.replace(url.href)
        else location.assign(url.href)
        return
      }
      try {
        updateDocumentHead(routeDocument.html)
      } catch {
        /* Non-fatal head sync error must not abort navigation. */
      }
      if ("catalog" in routeDocument.page && Array.isArray(routeDocument.page.catalog)) {
        applyBrawlerCatalog({ brawlers: routeDocument.page.catalog })
      }
      const visit = { page: routeDocument.page, href: nextHref }
      const nextDirection = navigationDirection(displayedPath.current, url.pathname, mode, window.matchMedia("(max-width: 1023px)").matches)
      restore.current = { scroll, hash: url.hash }
      startTransition(() => {
        setVisits(previous => {
          const retained = previous.filter(row => row.page.path !== visit.page.path)
          // Keep the five tool sessions. Public details remount so their
          // document-local anchor/ARIA IDs never coexist with another detail.
          return [...retained.filter(row => primaryPaths.has(row.page.path)), visit]
        })
        setCurrent(visit)
        setDirection(nextDirection)
        setRevision(value => value + 1)
        setPending(null)
      })
    }
    navigate.current = (href, mode) => { void perform(href, mode) }
    const findLink = (event: Event) => event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = findLink(event)
      if (!link || link.hasAttribute("download") || link.hasAttribute("data-document-navigation") || (link.target && link.target !== "_self")) return
      const url = new URL(link.href, location.href)
      if (url.origin !== location.origin || !isRuntimePath(url.pathname) || (url.pathname === location.pathname && url.search === location.search && url.hash)) return
      event.preventDefault()
      void perform(url.href)
    }
    const onIntent = (event: Event) => {
      const link = findLink(event)
      if (!link?.closest(".arena-site-header, .arena-bottom-nav, .arena-tool-card")) return
      const url = new URL(link.href, location.href)
      if (url.origin === location.origin && primaryPaths.has(url.pathname) && url.pathname !== location.pathname) void loader.load(url.pathname).catch(() => {})
    }
    const onPop = (event: PopStateEvent) => {
      const scroll = scrollHistory.resolvePop(event.state)
      void perform(location.href, "pop", scroll)
    }
    document.addEventListener("click", onClick)
    document.addEventListener("pointerover", onIntent)
    document.addEventListener("focusin", onIntent)
    window.addEventListener("popstate", onPop)
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("pagehide", onPageHide)
    return () => {
      ++sequence.current
      history.scrollRestoration = originalRestoration
      cancelAnimationFrame(scrollFrame)
      document.removeEventListener("click", onClick)
      document.removeEventListener("pointerover", onIntent)
      document.removeEventListener("focusin", onIntent)
      window.removeEventListener("popstate", onPop)
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("pagehide", onPageHide)
    }
  }, [page, loader])

  return <RuntimeRouter.Provider value={router}><RuntimePathname.Provider value={current.page.path}>
    <MainNav />
    {pending && <div className="arena-route-progress" aria-hidden="true" />}
    <div role="status" aria-live="polite" className="sr-only">{pending ? "画面を切り替えています" : revision ? "画面を切り替えました" : ""}</div>
    <main id="main-content" tabIndex={-1} aria-busy={!!pending} data-arena-route={current.page.path} data-route-direction={direction} className="container mx-auto px-3 pt-2.5 pb-20 sm:px-6 sm:pt-6 sm:pb-24 lg:p-8 max-w-7xl">
      {failure && <div role="alert" className="arena-route-error">
        <p>画面を読み込めませんでした。接続を確認して、もう一度お試しください。</p>
        <button type="button" onClick={() => navigate.current(failure.href, failure.mode)}>もう一度試す</button>
        <a href={failure.href} data-document-navigation>ページを開き直す</a>
      </div>}
      {visits.map(visit => <Activity key={visit.page.path} mode={visit.page.path === current.page.path ? "visible" : "hidden"}>
        <RuntimePathname.Provider value={visit.page.path}><RuntimeHref.Provider value={visit.href}>
          <div className="arena-route-frame" data-current={visit.page.path === current.page.path ? "true" : undefined}>
            <PageView page={visit.page} href={visit.href} />
          </div>
        </RuntimeHref.Provider></RuntimePathname.Provider>
      </Activity>)}
      <SiteFooter />
    </main>
  </RuntimePathname.Provider></RuntimeRouter.Provider>
}
