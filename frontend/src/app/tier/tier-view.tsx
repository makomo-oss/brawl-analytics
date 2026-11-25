"use client"

import { normalizeDate } from "@/lib/condition-pages"
import { useBrawlerCatalog } from "@/lib/use-brawler-catalog"
import { useState, useEffect, useRef } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Trophy, Swords, Search, X, TrendingUp, TrendingDown, AlertTriangle, User, Users, ArrowRight, Clock3 } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getBrawlerInfo, BRAWLER_MAP } from "@/lib/brawlers"
import { normalizeBrawlerSearch } from "@/lib/brawler-directory"
import { translateMode, translateMap, getModeIconUrl } from "@/lib/translations"
import { API_URL } from "@/lib/config"
import type { TierListData } from "@/lib/tier-data"
import Link from "@/components/document-link"
import { brawlerPath } from "@/lib/brawler-paths"
import { BrawlerDirectoryLink } from "@/components/brawler-directory-link"
import { BrawlerPreviewLink } from "@/components/brawler-preview-link"
import DocumentLink from "@/components/document-link"

import { characterDetailUrl, initialMatchup, type InitialMatchups } from "@/lib/matchup-preview"
import { fetchPublicStats, getCachedPublicStats } from "@/lib/public-stats-cache"
import { tierSummary } from "@/lib/page-insights"
import { tierFaq } from "@/lib/faq"
import { DataSummary } from "@/components/data-summary"
import { RankingTable } from "@/components/ranking-table"
import { FaqSection } from "@/components/faq-section"

const INITIAL_TIER_KEY = "global:all:all:"

interface CategoryData {
  modes: string[]
  maps: string[]
}

interface MatchupRow {
  brawler: string
  win_rate: number
  matches: number
}

interface CharacterDetail {
  character_id: string
  tier: string
  score?: number
  win_rate: number
  use_rate: number
  total_matches: number
  rank_position?: number
  kamo: MatchupRow[] | null
  tenteki: MatchupRow[] | null
  kamo_scope?: string
  tenteki_scope?: string
}

const RANK_TIERS = [
  { id: "all", label: "総合" },
  { id: "mythic", label: "エリート" },
  { id: "legendary", label: "レジェンド" },
  { id: "masters", label: "マスター・プロ" },
] as const

const tierConfig: Record<string, { label: string }> = {
  "S+": { label: "最上位・優先候補" },
  S: { label: "上位グループ" },
  "A+": { label: "上位寄り" },
  A: { label: "中央帯" },
  B: { label: "下位寄り・実用" },
  C: { label: "状況を選ぶ" },
  D: { label: "現環境では厳しい" },
  "N/A": { label: "データ不足" },
}

const sheetTierGradient: Record<string, string> = {
  "S+": "from-purple-600 to-fuchsia-500",
  S: "from-pink-500 to-rose-500",
  "A+": "from-red-500 to-amber-500",
  A: "from-orange-500 to-yellow-500",
  B: "from-yellow-500 to-lime-500",
  C: "from-blue-500 to-cyan-500",
  D: "from-slate-500 to-gray-500",
  "N/A": "from-slate-500 to-stone-500",
}

export default function TierListPage({ initialTierData, initialMatchups }: { initialTierData: TierListData; initialMatchups: InitialMatchups }) {
  useBrawlerCatalog()
  // Built from the server payload only, so server and client text match.
  const initialSummary = tierSummary(initialTierData, "global")
  const initialFaq = tierFaq(initialSummary, initialTierData)
  const [tierData, setTierData] = useState<TierListData | null>(initialTierData)
  const [loading, setLoading] = useState(false)
  const [selectedChar, setSelectedChar] = useState<CharacterDetail | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [modalLoading, setModalLoading] = useState(false)
  const [modalError, setModalError] = useState(false)

  const [selectedType, setSelectedType] = useState("global")
  const [selectedRankTier, setSelectedRankTier] = useState("all") // all, mythic, legendary, masters
  const [subType, setSubType] = useState("all") // all, mode, map
  const [selectedId, setSelectedId] = useState("")
  const [charQuery, setCharQuery] = useState("")
  const [categories, setCategories] = useState<CategoryData>({ modes: [], maps: [] })

  // クライアントサイド・インメモリキャッシュ (0ms即時切り替え用)
  const dataCacheRef = useRef<Record<string, TierListData | CategoryData>>({ [INITIAL_TIER_KEY]: initialTierData })
  const [detailRequest, setDetailRequest] = useState<{ url: string; hasPreview: boolean; nonce: number } | null>(null)

  const fetchWithDedup = async (cacheKey: string, url: string): Promise<TierListData | null> => {
    try {
      const data = (await fetchPublicStats(url)) as TierListData
      dataCacheRef.current[cacheKey] = data
      return data
    } catch (error) {
      console.error(error)
      return null
    }
  }

  useEffect(() => {
    if (selectedType !== "gachi") return
    let active = true
    const fetchCategories = async () => {
      try {
        const cacheKey = `categories:${selectedType}`
        const cachedCats = dataCacheRef.current[cacheKey] as CategoryData | undefined
        if (cachedCats) {
          setCategories(cachedCats)
        }
        const data = (await fetchPublicStats(`${API_URL}/meta/categories?type=${selectedType}`)) as CategoryData
        if (active) {
          dataCacheRef.current[cacheKey] = data
          setCategories(data)

          setSubType((prevSubType) => {
            setSelectedId((prevSelectedId) => {
              if (prevSubType === "map" && !data.maps.includes(prevSelectedId)) {
                return data.maps.length > 0 ? data.maps[0] : ""
              }
              return prevSelectedId
            })
            return prevSubType
          })
        }
      } catch (err) {
        console.error(err)
      }
    }
    fetchCategories()
    return () => { active = false }
  }, [selectedType])

  // 選択に応じたTierデータの取得 (キャッシュ最優先・0ms即時切り替え)
  useEffect(() => {
    let active = true
    const cacheKey = selectedType === "global" ? INITIAL_TIER_KEY : `${selectedType}:${selectedRankTier}:${subType}:${selectedId}`
    const cachedData = dataCacheRef.current[cacheKey] as TierListData | undefined

    if (cachedData) {
      setTierData(cachedData)
      setLoading(false)
    } else {
      setLoading(true)
    }

    const fetchTierList = async () => {
      try {
        let url = `${API_URL}/meta/tier-list?type=${selectedType}`
        if (selectedType === "gachi") {
          url += `&rank_tier=${selectedRankTier}`
          if (subType !== "all" && selectedId) {
            url += `&sub_type=${subType}&id=${encodeURIComponent(selectedId)}`
          }
        }

        if (selectedType === "gachi" && subType !== "all" && !selectedId) {
          setLoading(false)
          return
        }

        const data = await fetchWithDedup(cacheKey, url)
        if (!active) return
        if (data) {
          setTierData(data)
        } else if (!cachedData) {
          setTierData(null)
        }
      } catch (err) {
        console.error(err)
        if (active && !cachedData) setTierData(null)
      } finally {
        if (active) setLoading(false)
      }
    }
    fetchTierList()
    return () => { active = false }
  }, [selectedType, selectedRankTier, subType, selectedId])

  useEffect(() => {
    if (!detailRequest) return
    let active = true
    const loadDetail = async () => {
      try {
        const data = (await fetchPublicStats(detailRequest.url)) as CharacterDetail
        if (active) setSelectedChar(data)
      } catch (err) {
        console.error(err)
        if (active) setModalError(!detailRequest.hasPreview)
      } finally {
        if (active) setModalLoading(false)
      }
    }
    void loadDetail()
    return () => { active = false }
  }, [detailRequest])

  const handleTypeChange = (value: string) => {
    setSelectedType(value)
  }

  const handleSubTypeChange = (value: string) => {
    setSubType(value)
    if (value === "mode" && categories.modes.length > 0) setSelectedId(categories.modes[0])
    else if (value === "map" && categories.maps.length > 0) setSelectedId(categories.maps[0])
    else setSelectedId("")
  }

  const fetchCharacterDetail = (charName: string) => {
    const url = characterDetailUrl(API_URL, charName, selectedType, selectedRankTier, subType, selectedId)
    const preview = getCachedPublicStats(url) || initialMatchup(initialMatchups, charName, selectedType, selectedRankTier, subType, selectedId)

    const currentTierChar = tierData?.characters?.[charName] || {
      win_rate: 50.0,
      use_rate: 0.0,
      total_matches: 0
    }

    let currentTier = "Unknown"
    if (tierData?.tiers) {
      for (const [tName, charList] of Object.entries(tierData.tiers as Record<string, string[]>)) {
        if (charList.includes(charName)) {
          currentTier = tName
          break
        }
      }
    }

    setSelectedChar({
      ...currentTierChar,
      character_id: charName,
      tier: currentTier,
      win_rate: currentTierChar.win_rate,
      use_rate: currentTierChar.use_rate,
      total_matches: currentTierChar.total_matches,
      kamo: null,
      tenteki: null,
      ...preview
    })
    setSheetOpen(true)
    setModalLoading(!preview)
    setModalError(false)
    setDetailRequest((prev) => ({
      url,
      hasPreview: Boolean(preview),
      nonce: (prev?.nonce ?? 0) + 1
    }))
  }

  const prefetchCharacterDetail = (name: string) => {
    if (initialMatchup(initialMatchups, name, selectedType, selectedRankTier, subType, selectedId)) return
    void fetchPublicStats(characterDetailUrl(API_URL, name, selectedType, selectedRankTier, subType, selectedId)).catch(() => {})
  }

  const updatedStamp = normalizeDate(tierData?.updated_at ?? null)
  const updatedAt = updatedStamp ? new Date(updatedStamp) : null
  const updatedLabel = updatedAt && Number.isFinite(updatedAt.getTime())
    ? new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23"
      }).format(updatedAt)
    : null

  const normalizedCharQuery = normalizeBrawlerSearch(charQuery)
  const matchesCharQuery = (charId: string) => {
    if (!normalizedCharQuery) return true
    const info = getBrawlerInfo(charId)
    return [info.nameJa, charId].some((candidate) =>
      normalizeBrawlerSearch(candidate).includes(normalizedCharQuery)
    )
  }

  const hasEmptyTierData = Boolean(
    tierData?.tiers && Object.values(tierData.tiers).every((arr) => arr.length === 0)
  )
  const filteredRows = ['S+', 'S', 'A+', 'A', 'B', 'C', 'D', 'N/A']
    .map((tierKey) => {
      let chars = tierData?.tiers?.[tierKey] || []
      if (tierKey === 'N/A' && tierData?.tiers) {
        const allDefined = Object.keys(BRAWLER_MAP)
        const present = new Set(['S+', 'S', 'A+', 'A', 'B', 'C', 'D'].flatMap(k => tierData.tiers[k] || []))
        chars = allDefined.filter(c => !present.has(c))
      }
      if (normalizedCharQuery) {
        chars = chars.filter(matchesCharQuery)
      }
      return { tierKey, chars }
    })
    .filter((row) => row.chars.length > 0)

  const visibleCount = filteredRows.reduce((sum, row) => sum + row.chars.length, 0)

  return (
    <div className="arena-workspace arena-tier space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-7xl mx-auto">
      <header className="arena-tier-header">
        <div className="space-y-2 min-w-0">
          <p className="arena-tier-eyebrow">COMPETITIVE TIER LIST</p>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2.5">
            <Trophy aria-hidden="true" className="w-7 h-7 shrink-0" />
            <span>ブロスタ最強キャラ・ティア表</span>
          </h1>
          {!loading && (
            <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
              {selectedType === "gachi"
                ? `直近60日のガチバトル・エリート以上の戦績（${(tierData?.metrics?.analyzed_matches ?? 0).toLocaleString()} 件のプレイヤー戦績）から算出。直近30日を重視したランキング。`
                : `上位プレイヤーの直近60日のバトルログ（${(tierData?.metrics?.analyzed_matches ?? 0).toLocaleString()} 件のプレイヤー戦績）から算出。直近30日を重視したランキング。`
              }
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 pt-0.5">
            {!loading && tierData && (
              <p className="text-muted-foreground text-xs flex items-center gap-1.5">
                <Clock3 aria-hidden="true" className="w-3.5 h-3.5" />
                最終更新：{updatedLabel
                  ? <time dateTime={updatedAt!.toISOString()}>{updatedLabel}（日本時間）</time>
                  : "—"}
              </p>
            )}
            <nav aria-label="関連ランキング" className="flex flex-wrap items-center gap-2">
              <DocumentLink href="/modes" className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-1 text-xs font-bold text-slate-200 hover:border-primary/50 hover:text-primary transition-colors">モード別</DocumentLink>
              <DocumentLink href="/maps" className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-1 text-xs font-bold text-slate-200 hover:border-cyan-400/50 hover:text-cyan-300 transition-colors">マップ別</DocumentLink>
              <BrawlerDirectoryLink className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-1 text-xs font-bold text-slate-200 hover:border-primary/50 hover:text-primary transition-colors">
                <Users aria-hidden="true" className="w-3.5 h-3.5" />キャラ一覧<ArrowRight aria-hidden="true" className="w-3 h-3" />
              </BrawlerDirectoryLink>
            </nav>
          </div>
        </div>

        <div className="arena-tier-seg-group shrink-0" role="group" aria-label="集計対象切替">
          <button
            type="button"
            className={`arena-tier-seg-btn ${selectedType === "global" ? "is-active" : ""}`}
            aria-pressed={selectedType === "global"}
            onClick={() => handleTypeChange("global")}
          >
            全体Tier
          </button>
          <button
            type="button"
            className={`arena-tier-seg-btn ${selectedType === "gachi" ? "is-active" : ""}`}
            aria-pressed={selectedType === "gachi"}
            onClick={() => handleTypeChange("gachi")}
          >
            ガチバトルTier
          </button>
        </div>
      </header>

      <DataSummary summary={initialSummary} />

      <section className="arena-tier-filterbar" aria-label="ティア表フィルター">
        {selectedType === "gachi" ? (
          <>
            <div className="arena-tier-filter-row">
              <div className="arena-tier-seg-group" role="group" aria-label="条件種別">
                <button
                  type="button"
                  className={`arena-tier-seg-btn ${subType === "all" ? "is-active" : ""}`}
                  aria-pressed={subType === "all"}
                  onClick={() => handleSubTypeChange("all")}
                >
                  すべて
                </button>
                <button
                  type="button"
                  className={`arena-tier-seg-btn ${subType === "mode" ? "is-active" : ""}`}
                  aria-pressed={subType === "mode"}
                  onClick={() => handleSubTypeChange("mode")}
                >
                  モード別
                </button>
                <button
                  type="button"
                  className={`arena-tier-seg-btn ${subType === "map" ? "is-active" : ""}`}
                  aria-pressed={subType === "map"}
                  onClick={() => handleSubTypeChange("map")}
                >
                  マップ別
                </button>
              </div>

              {subType === "mode" && (
                <div className="arena-tier-mode-pills" role="group" aria-label="モード選択">
                  {categories.modes.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`arena-tier-seg-btn inline-flex items-center gap-1.5 ${selectedId === m ? "is-active" : ""}`}
                      aria-pressed={selectedId === m}
                      onClick={() => setSelectedId(m)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={getModeIconUrl(m)} alt="" width={16} height={16} className="w-4 h-4 object-contain shrink-0" />
                      <span>{translateMode(m)}</span>
                    </button>
                  ))}
                </div>
              )}

              {subType === "map" && (
                <Select value={selectedId} onValueChange={(val) => setSelectedId(val || "")}>
                  <SelectTrigger className="w-full sm:w-[260px]">
                    <SelectValue placeholder="マップを選択...">
                      {selectedId ? translateMap(selectedId) : "マップを選択..."}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {categories.maps.map((m) => (
                      <SelectItem key={m} value={m}>{translateMap(m)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="arena-tier-filter-row">
              <div className="arena-tier-seg-group" role="group" aria-label="ランク帯フィルター">
                {RANK_TIERS.map((tier) => (
                  <button
                    key={tier.id}
                    type="button"
                    className={`arena-tier-seg-btn ${selectedRankTier === tier.id ? "is-active" : ""}`}
                    aria-pressed={selectedRankTier === tier.id}
                    onClick={() => setSelectedRankTier(tier.id)}
                  >
                    {tier.label}
                  </button>
                ))}
              </div>

              <div className="arena-tier-search-wrap relative">
                <label htmlFor="tier-char-search" className="sr-only">キャラ名で絞り込み</label>
                <Search aria-hidden="true" className="absolute left-3.5 top-3.5 w-4 h-4 text-muted-foreground pointer-events-none" />
                <input
                  id="tier-char-search"
                  type="search"
                  value={charQuery}
                  onChange={(e) => setCharQuery(e.target.value)}
                  placeholder="キャラ名で絞り込み..."
                  autoComplete="off"
                  className="h-11 w-full rounded-xl border text-sm pl-10 pr-11 outline-none transition-colors [&::-webkit-search-cancel-button]:appearance-none"
                />
                {charQuery && (
                  <button
                    type="button"
                    aria-label="検索をクリア"
                    onClick={() => setCharQuery("")}
                    className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground"
                  >
                    <X aria-hidden="true" className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="arena-tier-filter-row">
            <p className="text-xs sm:text-sm font-bold text-slate-300 tabular-nums">
              表示中 {visibleCount}体
            </p>
            <div className="arena-tier-search-wrap relative">
              <label htmlFor="tier-char-search" className="sr-only">キャラ名で絞り込み</label>
              <Search aria-hidden="true" className="absolute left-3.5 top-3.5 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                id="tier-char-search"
                type="search"
                value={charQuery}
                onChange={(e) => setCharQuery(e.target.value)}
                placeholder="キャラ名で絞り込み..."
                autoComplete="off"
                className="h-11 w-full rounded-xl border text-sm pl-10 pr-11 outline-none transition-colors [&::-webkit-search-cancel-button]:appearance-none"
              />
              {charQuery && (
                <button
                  type="button"
                  aria-label="検索をクリア"
                  onClick={() => setCharQuery("")}
                  className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground"
                >
                  <X aria-hidden="true" className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      <div className="space-y-4">
        {loading ? (
          <div className="h-64 flex items-center justify-center border rounded-xl bg-card/50 backdrop-blur-sm">
            <span className="text-primary font-medium animate-pulse flex items-center gap-2">
              <Swords className="w-5 h-5 animate-spin" /> データ集計中...
            </span>
          </div>
        ) : (
          <div className="grid gap-4">
            {hasEmptyTierData ? (
              <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed rounded-xl bg-card/50">
                <AlertTriangle className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
                <h3 className="text-xl font-bold text-foreground">まだデータがありません</h3>
                <p className="text-muted-foreground mt-2 max-w-md">
                  指定された条件（ガチバトル・モード・マップ等）の分析データがまだ十分に集まっていません。<br/>
                  今後のプレイヤーデータの集計をお待ちください。
                </p>
              </div>
            ) : normalizedCharQuery && filteredRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-10 text-center border border-dashed rounded-xl bg-card/50 space-y-3">
                <p className="text-sm text-muted-foreground">「{charQuery}」に一致するキャラが見つかりません</p>
                <button type="button" onClick={() => setCharQuery("")} className="text-sm font-bold text-primary hover:underline">
                  検索をクリア
                </button>
              </div>
            ) : (
              filteredRows.map(({ tierKey, chars }) => {
                const config = tierConfig[tierKey] || tierConfig['D']

                return (
                  <Card key={tierKey} data-arena-tier={tierKey} className="arena-tier-row overflow-hidden backdrop-blur-sm">
                    <div className="flex flex-col md:flex-row">
                      <div className="arena-tier-label md:w-28 flex md:flex-col items-center justify-between md:justify-center gap-1.5 p-3.5 md:p-4" title={config.label}>
                        <h2 className="text-3xl md:text-4xl font-black tracking-tight">{tierKey}</h2>
                        <span className="arena-tier-count tabular-nums">{chars.length}体</span>
                      </div>

                      <div className="arena-tier-chips flex-1 p-3 sm:p-4">
                        {chars.map((charId: string) => {
                          const info = getBrawlerInfo(charId)
                          const stats = tierData?.characters?.[charId]
                          const hasStats = Boolean(stats && stats.total_matches > 0)

                          return (
                            <BrawlerPreviewLink
                              name={info.nameJa}
                              href={hasStats ? brawlerPath(charId) : undefined}
                              key={charId}
                              onPreview={() => { fetchCharacterDetail(charId) }}
                              onIntent={() => prefetchCharacterDetail(charId)}
                              className="arena-tier-chip group"
                            >
                              <div className="arena-tier-chip-avatar relative overflow-hidden flex items-center justify-center shrink-0">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  loading="lazy"
                                  decoding="async"
                                  src={info.imageUrl}
                                  alt={info.nameJa}
                                  className="object-cover w-full h-full relative z-10"
                                  onError={(e) => { e.currentTarget.src = 'https://cdn.brawlify.com/brawler/shelly.png'; }}
                                />
                                <User className="w-6 h-6 text-primary/40 absolute" />
                              </div>
                              <span className="arena-tier-chip-name">{info.nameJa}</span>
                            </BrawlerPreviewLink>
                          )
                        })}
                      </div>
                    </div>
                  </Card>
                )
              })
            )}
          </div>
        )}
      </div>

      <Link href="/brawlers" className="inline-block text-sm font-medium text-primary hover:underline">キャラ詳細一覧を見る</Link>
      <RankingTable id="tier-top" title="全体Tier 上位10キャラ" rows={initialSummary?.top || []} />
      <FaqSection id="faq-tier" items={initialFaq} />

      {/* キャラクター詳細モーダル (Sheet) */}
      {selectedChar && <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto backdrop-blur-xl border-l-primary/20">
          {selectedChar && (
            <div className="space-y-6 pb-8">
              <SheetHeader className="text-left">
                <div className="flex items-center gap-4 mb-2">
                  <div className="w-20 h-20 shrink-0 border-2 shadow-xl ring-2 ring-primary/20 rounded-xl bg-primary/10 relative overflow-hidden flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={getBrawlerInfo(selectedChar.character_id).imageUrl}
                      alt={selectedChar.character_id}
                      className="object-cover w-full h-full rounded-lg absolute inset-0 z-10"
                      onError={(e) => { e.currentTarget.src = 'https://cdn.brawlify.com/brawler/shelly.png'; }}
                    />
                    <User className="w-8 h-8 text-primary/40" />
                  </div>
                  <div>
                    <SheetTitle className="text-3xl font-black capitalize">{getBrawlerInfo(selectedChar.character_id).nameJa}</SheetTitle>
                    <SheetDescription className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className={`font-black text-sm bg-gradient-to-r ${sheetTierGradient[selectedChar.tier] || 'from-gray-500 to-gray-600'} text-white border-none`}>
                        環境Tier {selectedChar.tier}
                      </Badge>
                      <span className="text-xs font-mono tabular-nums text-muted-foreground">スコア: {selectedChar.score} / {selectedChar.total_matches}試合</span>
                    </SheetDescription>
                    {selectedChar.total_matches > 0 && <a href={brawlerPath(selectedChar.character_id)} className="inline-block mt-2 text-xs text-primary hover:underline" onClick={event => {
                      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
                      // Activity retains this page. Unmount the portal before its effects stop.
                      setDetailRequest(null)
                      setSheetOpen(false)
                      setSelectedChar(null)
                    }}>詳細ページを見る</a>}
                  </div>
                </div>
              </SheetHeader>

              <div className="grid grid-cols-3 gap-2 sm:gap-4">
                <Card className="bg-secondary/20 border-none shadow-inner">
                  <div className="p-2.5 sm:p-4 flex flex-col items-center justify-center">
                    <span className="text-xs font-bold text-muted-foreground mb-1">総合勝率</span>
                    <span className={`text-lg sm:text-2xl font-black tabular-nums ${selectedChar.win_rate >= 55 ? 'text-green-500' : selectedChar.win_rate >= 50 ? 'text-blue-500' : 'text-orange-500'}`}>
                      {selectedChar.win_rate}%
                    </span>
                  </div>
                </Card>
                <Card className="bg-secondary/20 border-none shadow-inner">
                  <div className="p-2.5 sm:p-4 flex flex-col items-center justify-center">
                    <span className="text-xs font-bold text-muted-foreground mb-1">観測内使用率</span>
                    <span className="text-lg sm:text-2xl font-black tabular-nums text-primary">
                      {selectedChar.use_rate}%
                    </span>
                  </div>
                </Card>
                <Card className="bg-secondary/20 border-none shadow-inner">
                  <div className="p-2.5 sm:p-4 flex flex-col items-center justify-center">
                    <span className="text-[10px] font-bold text-muted-foreground mb-1 text-center leading-tight">選択条件での<br/>分析試合数</span>
                    <span className="text-base sm:text-xl font-black tabular-nums text-foreground">
                      {selectedChar.total_matches}
                    </span>
                  </div>
                </Card>
              </div>

              {selectedChar.rank_position && (
                <p className="text-sm tabular-nums text-muted-foreground mt-4">スコア順位: {selectedChar.rank_position}位 / 判定対象{String(tierData?.metrics?.eligible_characters ?? "")}体</p>
              )}
              <div className="space-y-6 mt-8">
                {/* 有利な対面 */}
                <div className="space-y-3 relative p-4 rounded-xl bg-green-500/5 border border-green-500/20">
                  <h3 className="font-extrabold text-sm flex items-center gap-2 text-green-600 dark:text-green-400">
                    <TrendingUp className="w-5 h-5" /> 有利な対面 TOP5 <span className="text-[10px] text-muted-foreground font-normal">（{selectedChar.kamo_scope || "選択条件"}・補正勝率）</span>
                  </h3>
                  {selectedChar.kamo && selectedChar.kamo.length > 0 ? (
                    <div className="space-y-2">
                      {selectedChar.kamo.map((k: MatchupRow, idx: number) => {
                        const info = getBrawlerInfo(k.brawler)
                        return (
                          <div key={idx} className="flex items-center justify-between p-2 rounded-lg hover:bg-green-500/10 transition-colors">
                            <div className="flex items-center gap-3">
                              <Avatar className="w-8 h-8 border border-green-500/30">
                                <AvatarImage src={info.imageUrl} />
                                <AvatarFallback className="bg-green-500/10"><User className="w-4 h-4 text-green-500/70" /></AvatarFallback>
                              </Avatar>
                              <span className="font-bold text-sm">{info.nameJa}</span>
                            </div>
                            <div className="text-right tabular-nums">
                              <span className="font-black text-green-500">{k.win_rate}%</span>
                              <div className="text-[10px] text-muted-foreground">{k.matches}戦</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : modalLoading ? (
                    <div className="space-y-2 py-2">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-10 bg-green-500/10 rounded-lg animate-pulse" />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground p-2">{modalError ? "対面データの取得に失敗しました。もう一度開いてください。" : "5戦以上の有利傾向の対面がありません。"}</p>
                  )}
                </div>

                {/* 不利な対面 */}
                <div className="space-y-3 relative p-4 rounded-xl bg-red-500/5 border border-red-500/20">
                  <h3 className="font-extrabold text-sm flex items-center gap-2 text-red-600 dark:text-red-400">
                    <TrendingDown className="w-5 h-5" /> 不利な対面 TOP5 <span className="text-[10px] text-muted-foreground font-normal">（{selectedChar.tenteki_scope || "選択条件"}・補正勝率）</span>
                  </h3>
                  {selectedChar.tenteki && selectedChar.tenteki.length > 0 ? (
                    <div className="space-y-2">
                      {selectedChar.tenteki.map((t: MatchupRow, idx: number) => {
                        const info = getBrawlerInfo(t.brawler)
                        return (
                          <div key={idx} className="flex items-center justify-between p-2 rounded-lg hover:bg-red-500/10 transition-colors">
                            <div className="flex items-center gap-3">
                              <Avatar className="w-8 h-8 border border-red-500/30">
                                <AvatarImage src={info.imageUrl} />
                                <AvatarFallback className="bg-red-500/10"><User className="w-4 h-4 text-destructive/70" /></AvatarFallback>
                              </Avatar>
                              <span className="font-bold text-sm">{info.nameJa}</span>
                            </div>
                            <div className="text-right tabular-nums">
                              <span className="font-black text-red-500">{t.win_rate}%</span>
                              <div className="text-[10px] text-muted-foreground">{t.matches}戦</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : modalLoading ? (
                    <div className="space-y-2 py-2">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-10 bg-red-500/10 rounded-lg animate-pulse" />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground p-2">{modalError ? "対面データの取得に失敗しました。もう一度開いてください。" : "5戦以上の不利傾向の対面がありません。"}</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>}
    </div>
  )
}
