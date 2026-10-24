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
import DraftCompanionPage from "@/app/companion/companion-view"
import type { DraftCategories } from "@/lib/draft-categories"
import { createRouteLoader, isRuntimePath } from "./route-loader"
import { navigationDirection } from "@/lib/arena-navigation-motion"

export type OverviewPage = ({ kind: "home"; path: "/" } | { kind: "tier"; path: "/tier" }) & { tierData: TierListData; initialMatchups: InitialMatchups }
export type ToolPage = { kind: "player"; path: "/player" } | { kind: "companion"; path: "/companion"; categories: DraftCategories }
export type RuntimePage = PublicPage | OverviewPage | ToolPage

function PageView({ page, href }: { page: RuntimePage; href: string }) {
  if (page.kind === "player") return <>
    <header className="mb-8 space-y-2"><h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">ブロスタ戦績検索・勝率確認</h1></header>
    <PlayerView defaultTag={new URL(href, "https://brawl-lab.sozai-hub.com").searchParams.get("tag") || ""} />
  </>
  if (page.kind === "companion") return <DraftCompanionPage initialCategories={page.categories} />
  return page.kind === "home" ? <HomeView initialTierData={page.tierData} initialMatchups={page.initialMatchups} /> : page.kind === "tier" ? <TierView initialTierData={page.tierData} initialMatchups={page.initialMatchups} /> : page.kind === "detail" ? <BrawlerDetailView data={page.data} /> : page.kind === "directory" ? <BrawlerDirectoryView entries={page.entries} /> : page.kind === "condition" ? <ConditionDetailView data={page.data} /> : <ConditionDirectoryView index={page.index} kind={page.category} />
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
    // Keep server HTML deterministic; read deep-link query parameters on mount.
    const initialHref = location.pathname + location.search + location.hash
    setCurrent({ page, href: initialHref })
    setVisits([{ page, href: initialHref }])
    let scrollFrame = 0
    const saveScroll = () => history.replaceState({ ...history.state, arenaScroll: window.scrollY }, "")
    const onScroll = () => {
      if (!scrollFrame) scrollFrame = requestAnimationFrame(() => { scrollFrame = 0; saveScroll() })
    }
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
      try {
        const document = await loader.load(url.pathname)
        if (id !== sequence.current) return
        if (mode !== "pop") {
          saveScroll()
          history[mode === "replace" ? "replaceState" : "pushState"]({ arenaScroll: 0 }, "", nextHref)
        }
        updateDocumentHead(document.html)
        const visit = { page: document.page, href: nextHref }
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
      } catch {
        if (id === sequence.current) { setPending(null); setFailure({ href: nextHref, mode }) }
      }
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
    const onPop = (event: PopStateEvent) => { void perform(location.href, "pop", Number(event.state?.arenaScroll) || 0) }
    document.addEventListener("click", onClick)
    document.addEventListener("pointerover", onIntent)
    document.addEventListener("focusin", onIntent)
    window.addEventListener("popstate", onPop)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      ++sequence.current
      history.scrollRestoration = originalRestoration
      cancelAnimationFrame(scrollFrame)
      document.removeEventListener("click", onClick)
      document.removeEventListener("pointerover", onIntent)
      document.removeEventListener("focusin", onIntent)
      window.removeEventListener("popstate", onPop)
      window.removeEventListener("scroll", onScroll)
    }
  }, [page, loader])

  return <RuntimeRouter.Provider value={router}><RuntimePathname.Provider value={current.page.path}>
    <MainNav />
    {pending && <div className="arena-route-progress" aria-hidden="true" />}
    <div role="status" aria-live="polite" className="sr-only">{pending ? "画面を切り替えています" : revision ? "画面を切り替えました" : ""}</div>
    <main id="main-content" tabIndex={-1} aria-busy={!!pending} data-arena-route={current.page.path} data-route-direction={direction} className="container mx-auto px-3 py-4 sm:p-6 lg:p-8 max-w-7xl pb-24 lg:pb-8">
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
    </main>
  </RuntimePathname.Provider></RuntimeRouter.Provider>
}
