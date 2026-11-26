"use client"



import { useBrawlerCatalog } from "@/lib/use-brawler-catalog"
import { useState, useEffect, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Search, Trophy, Swords, Building2, Users, User, Zap } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { getBrawlerInfo, getRankImage } from "@/lib/brawlers"
import { translateMode, translateMap, getModeIconUrl } from "@/lib/translations"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { API_URL } from "@/lib/config"
import PlayerAnalysis from "./player-analysis"
import PlayerAutoSync from "./player-auto-sync"
import { brawlerPath } from "@/lib/brawler-paths"
import { playerBrawlerSorts, sortPlayerBrawlers, type PlayerBrawlerSort } from "@/lib/player-brawler-sort"

function formatBattleTime(timeStr: string) {
  if (!timeStr) return "";
  
  // Brawl Stars API format: "20240718T123045.000Z"
  // Convert to valid ISO 8601: "2024-07-18T12:30:45.000Z"
  let parsedTime = timeStr;
  if (timeStr.length >= 15 && timeStr.indexOf('T') === 8) {
    const yyyy = timeStr.substring(0, 4);
    const MM = timeStr.substring(4, 6);
    const dd = timeStr.substring(6, 8);
    const HH = timeStr.substring(9, 11);
    const mm = timeStr.substring(11, 13);
    const ss = timeStr.substring(13, 15);
    const msZ = timeStr.substring(15);
    parsedTime = `${yyyy}-${MM}-${dd}T${HH}:${mm}:${ss}${msZ}`;
  }

  const d = new Date(parsedTime);
  if (isNaN(d.getTime())) return timeStr;
  
  return `${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function translateRole(role: string): string {
  if (!role) return "メンバー";
  const r = role.toLowerCase().replace(/[\s_\-]/g, "");
  if (r === "president") return "会長";
  if (r === "vicepresident") return "副会長";
  if (r === "senior") return "シニア";
  if (r === "member") return "メンバー";
  return role;
}

interface ComponentItem {
  id: number;
  name: string;
}

interface Brawler {
  id: number;
  name: string;
  power: number;
  rank: number;
  trophies: number;
  highestTrophies: number;
  gadgets: ComponentItem[];
  starPowers: ComponentItem[];
  gears: { id: number; name: string; level: number }[];
  hyperCharges: ComponentItem[];
}

interface DashboardData {
  player_tag: string;
  source?: "saved" | "profile-only";
  profile?: {
    name: string;
    icon_id: number;
    trophies: number;
    highest_trophies: number;
    highest_rank: number;
    ranked_elo: number;
    highest_ranked_elo: number;
    ranked_rank: number;
    highest_ranked_rank: number;
    level: number;
    club_name: string;
    club_tag?: string;
    "3v3_victories": number;
  };
  brawlers?: Brawler[];
  recent_battles?: any[];
  gap_analysis?: any[];
  insights?: {
    gap_analysis: any[];
    hidden_weapons: string[];
    needs_practice: string[];
    mode_analysis: {
      mode: string;
      matches: number;
      wins: number;
      win_rate: number;
      star_player_count: number;
      top_brawlers: string[];
    }[];
  };
}

export default function PlayerView({ defaultTag }: { defaultTag?: string }) {
  useBrawlerCatalog()
  const params = useParams()
  const router = useRouter()
  const routeTag = defaultTag || (params?.tag ? decodeURIComponent(String(params.tag)) : "")
  const appliedRouteTag = useRef<string | undefined>(undefined)

  const [searchMode, setSearchMode] = useState<"player" | "club">("player")
  const [playerTag, setPlayerTag] = useState(routeTag ? (routeTag.startsWith("#") ? routeTag : `#${routeTag}`) : "")
  const [clubInput, setClubInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [loadingClub, setLoadingClub] = useState(false)
  const [data, setData] = useState<DashboardData | null>(null)
  const [analysisRevision, setAnalysisRevision] = useState(0)
  const [clubData, setClubData] = useState<any | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [battleTab, setBattleTab] = useState("all")
  const [resultFilter, setResultFilter] = useState<"all" | "victory" | "defeat">("all")
  const [modeFilter, setModeFilter] = useState<string>("all")
  const [brawlerSort, setBrawlerSort] = useState<PlayerBrawlerSort>("trophies")

  // プレイヤー名検索サジェスト用ステート
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [candidates, setCandidates] = useState<any[]>([])
  const [candidateModalOpen, setCandidateModalOpen] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [isSearching, setIsSearching] = useState(false)

  // クラブ名検索サジェスト用ステート
  const [clubSuggestions, setClubSuggestions] = useState<any[]>([])
  const [showClubSuggestions, setShowClubSuggestions] = useState(false)
  const [isSearchingClub, setIsSearchingClub] = useState(false)

  const searchContainerRef = useRef<HTMLDivElement>(null)

  // クライアントサイド・インメモリキャッシュ (0ms即時表示用)
  const dashboardCacheRef = useRef<Record<string, any>>({})



  const clubCacheRef = useRef<Record<string, any>>({})

  // 外部クリックでサジェストを閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false)
        setShowClubSuggestions(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // プレイヤー検索のデバウンス処理（リアルタイム検索・AbortController付き）
  useEffect(() => {
    const trimmed = (playerTag || "").trim()
    if (!trimmed || trimmed.startsWith("#")) {
      setSuggestions([])
      setShowSuggestions(false)
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    const controller = new AbortController()
    const timeoutId = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/player/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal
        })
        if (res.ok) {
          const result = await res.json()
          if (Array.isArray(result) && result.length > 0) {
            setSuggestions(result)
            setShowSuggestions(true)
          } else {
            setSuggestions([])
            setShowSuggestions(false)
          }
        } else {
          setSuggestions([])
          setShowSuggestions(false)
        }
      } catch (error: any) {
        if (error.name !== "AbortError") {
          console.error("Failed to search players", error)
          setSuggestions([])
          setShowSuggestions(false)
        }
      } finally {
        setIsSearching(false)
      }
    }, 120)

    return () => {
      clearTimeout(timeoutId)
      controller.abort()
    }
  }, [playerTag])

  // クラブ検索のデバウンス処理（リアルタイム検索・AbortController付き）
  useEffect(() => {
    const trimmed = (clubInput || "").trim()
    if (!trimmed || trimmed.startsWith("#")) {
      setClubSuggestions([])
      setShowClubSuggestions(false)
      setIsSearchingClub(false)
      return
    }

    setIsSearchingClub(true)
    const controller = new AbortController()
    const timeoutId = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/club/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal
        })
        if (res.ok) {
          const result = await res.json()
          if (Array.isArray(result) && result.length > 0) {
            setClubSuggestions(result)
            setShowClubSuggestions(true)
          } else {
            setClubSuggestions([])
            setShowClubSuggestions(false)
          }
        } else {
          setClubSuggestions([])
          setShowClubSuggestions(false)
        }
      } catch (error: any) {
        if (error.name !== "AbortError") {
          console.error("Failed to search clubs", error)
          setClubSuggestions([])
          setShowClubSuggestions(false)
        }
      } finally {
        setIsSearchingClub(false)
      }
    }, 120)

    return () => {
      clearTimeout(timeoutId)
      controller.abort()
    }
  }, [clubInput])

  
  // URL パラメータ(defaultTag)でタグが渡された場合、初回自動同期を実行
  useEffect(() => {
    // Returning to a preserved tab must not restart the URL-triggered sync or
    // clear an in-progress club view. A changed query still loads its player.
    if (appliedRouteTag.current === defaultTag) return
    appliedRouteTag.current = defaultTag
    if (defaultTag) {
      const formattedTag = defaultTag.startsWith("#") ? defaultTag : `#${defaultTag}`
      setPlayerTag(formattedTag)
      handleSync(formattedTag)
    }
  }, [defaultTag])

  const handleSync = async (overrideTag?: string) => {
    const rawInput = (overrideTag || playerTag || "").trim()
    if (!rawInput) return
    
    setShowSuggestions(false)
    setSuggestions([])
    setErrorMsg(null)
    setClubData(null)
    
    try {
      let finalTag = rawInput
      const cleanInput = rawInput.replace(/^#+/, "").trim()
      const isTagFormat = /^[A-Za-z0-9]{3,15}$/.test(cleanInput)
      
      if (!isTagFormat && !overrideTag && !rawInput.startsWith("#")) {
        // 名前入力の場合は事前検索
        try {
          const searchRes = await fetch(`${API_URL}/player/search?q=${encodeURIComponent(rawInput)}`)
          if (searchRes.ok) {
            const results = await searchRes.json()
            if (Array.isArray(results) && results.length > 0) {
              if (results.length === 1) {
                const pTag = results[0].player_tag || results[0].tag
                const formattedTag = `#${pTag.replace(/^#+/, "")}`
                finalTag = formattedTag
                setPlayerTag(formattedTag)
              } else {
                // 複数件ヒットした場合は候補モーダルを開いてユーザーに選択してもらう
                setCandidates(results)
                setCandidateModalOpen(true)
                setLoading(false)
                return
              }
            } else {
              setErrorMsg(`「${rawInput}」に一致するプレイヤーが見つかりませんでした。プレイヤータグ（例: #V99J0CCV8）をお試しください。`)
              setLoading(false)
              return
            }
          }
        } catch {
          // 検索に失敗した場合はそのまま入力タグで試行
        }
      } else {
        const formattedTag = `#${cleanInput}`
        finalTag = formattedTag
        setPlayerTag(formattedTag)
      }

      const cacheKey = finalTag.replace(/^#+/, "").toUpperCase().replace(/O/g, "0")
      setPlayerTag(`#${cacheKey}`)
      const cached = dashboardCacheRef.current[cacheKey]
      if (cached) {
        // キャッシュがあれば 0ms で即座に表示！
        setData(cached)
        setLoading(false)
      } else {
        setLoading(true)
        setData(null)
      }

      const res = await fetch(`${API_URL}/player/${encodeURIComponent(cacheKey)}/dashboard`)
      if (!res.ok) {
        if (res.status === 404) {
          setErrorMsg("そのプレイヤーIDは存在しません。")
        } else {
          const error: unknown = await res.json().catch(() => null)
          const detail = error && typeof error === "object" && "detail" in error ? error.detail : null
          setErrorMsg(typeof detail === "string" ? detail : "データの取得に失敗しました。")
        }
        return
      }
      const result = await res.json() as DashboardData & { error?: string }
      if (result.error) {
        setErrorMsg(result.error)
        return
      }
      dashboardCacheRef.current[cacheKey] = result
      setData(result)
      setAnalysisRevision(value => value + 1)
      if (result.profile?.name) {
        try {
          const saved = localStorage.getItem("burolabo_recent_searches")
          if (saved) {
            const parsed = JSON.parse(saved)
            if (Array.isArray(parsed)) {
              const targetTag = `#${cacheKey}`
              let updated = false
              const next = parsed.map((entry: { tag?: string; name?: string }) => {
                if (typeof entry?.tag === "string" && entry.tag.replace(/^#+/, "").toUpperCase().replace(/O/g, "0") === cacheKey && entry.name !== result.profile?.name) {
                  updated = true
                  return { ...entry, tag: targetTag, name: result.profile!.name }
                }
                return entry
              })
              if (updated) localStorage.setItem("burolabo_recent_searches", JSON.stringify(next))
            }
          }
        } catch {
          // ignore
        }
      }
      // URL を現在のタグで更新
      if (window.location.pathname === "/player") {
        window.history.replaceState(window.history.state, '', `/player?tag=${encodeURIComponent(cacheKey)}`)
      }
    } catch (error) {
      console.error("Fetch error", error)
      setErrorMsg("ネットワークエラーが発生しました。")
    } finally {
      setLoading(false)
    }
  }

  const handleSyncClub = async (overrideTag?: string) => {
    const rawInput = (overrideTag || clubInput || "").trim()
    if (!rawInput) return
    
    setShowClubSuggestions(false)
    setClubSuggestions([])
    setErrorMsg(null)
    setData(null)
    
    try {
      let finalTag = rawInput
      const cleanInput = rawInput.replace(/^#+/, "").trim()
      const isTagFormat = /^[A-Za-z0-9]{3,15}$/.test(cleanInput)
      
      if (!isTagFormat && !overrideTag) {
        try {
          const searchRes = await fetch(`${API_URL}/club/search?q=${encodeURIComponent(rawInput)}`)
          if (searchRes.ok) {
            const results = await searchRes.json()
            if (Array.isArray(results) && results.length > 0 && results[0]?.club_tag) {
              const formattedTag = `#${results[0].club_tag.replace(/^#+/, "")}`
              finalTag = formattedTag
              setClubInput(formattedTag)
            } else {
              setErrorMsg(`「${rawInput}」に一致するクラブが見つかりませんでした。クラブタグ（例: #2YRPU8RVV）をお試しください。`)
              setLoadingClub(false)
              return
            }
          }
        } catch {
          // 検索失敗時はそのまま試行
        }
      } else {
        const formattedTag = `#${cleanInput}`
        finalTag = formattedTag
        setClubInput(formattedTag)
      }

      const cacheKey = finalTag.replace(/^#+/, "").toUpperCase()
      const cached = clubCacheRef.current[cacheKey]
      if (cached) {
        setClubData(cached)
        setLoadingClub(false)
      } else {
        setLoadingClub(true)
        setClubData(null)
      }

      const res = await fetch(`${API_URL}/club/${encodeURIComponent(cacheKey)}`)
      if (!res.ok) {
        if (res.status === 404) {
          setErrorMsg("そのクラブは見つかりませんでした。")
        } else {
          setErrorMsg("クラブデータの取得に失敗しました。")
        }
        return
      }
      const result = await res.json()
      clubCacheRef.current[cacheKey] = result
      setClubData(result)
    } catch (error) {
      console.error("Fetch club error", error)
      setErrorMsg("ネットワークエラーが発生しました。")
    } finally {
      setLoadingClub(false)
    }
  }


  return (
    <div className="arena-workspace arena-dashboard space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Unified NEO-STARR Search Toolbar */}
      <section className="arena-player-toolbar relative z-40" ref={searchContainerRef} aria-label="プレイヤー・クラブ検索">
        <div className="relative flex-1 min-w-0 w-full md:max-w-xl">
          {searchMode === "player" ? (
            <div className="relative flex gap-2.5 sm:gap-3 w-full">
              <div className="relative flex-1 min-w-0">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#64748b] pointer-events-none" aria-hidden="true" />
                <Input
                  placeholder="プレイヤータグ (#...) または 名前で検索"
                  aria-label="プレイヤータグまたは名前"
                  value={playerTag}
                  onChange={(e) => {
                    setPlayerTag(e.target.value)
                    if (e.target.value.trim().length > 0) setShowSuggestions(true)
                  }}
                  onCompositionEnd={(e) => {
                    const val = e.currentTarget.value
                    setPlayerTag(val)
                    if (val.trim().length > 0) setShowSuggestions(true)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                      setShowSuggestions(false)
                      handleSync()
                    }
                  }}
                  onFocus={() => {
                    if (playerTag.trim().length > 0) setShowSuggestions(true)
                  }}
                  className="pl-9"
                />
              </div>
              <Button onClick={() => handleSync()} disabled={loading} className="shrink-0 px-5 sm:px-7">
                {loading ? "取得中..." : (
                  <>
                    <Search className="w-4 h-4 mr-1.5" />
                    検索
                  </>
                )}
              </Button>

              {/* プレイヤーサジェストドロップダウン */}
              {showSuggestions && (isSearching || suggestions.length > 0) && (
                <div className="absolute top-full left-0 w-full max-w-full mt-2 bg-[#141f3d] text-card-foreground border border-white/15 rounded-xl shadow-2xl z-[100] max-h-64 overflow-y-auto backdrop-blur-md">
                  {isSearching ? (
                    <div className="p-3 text-sm text-muted-foreground text-center animate-pulse">検索中...</div>
                  ) : (
                    <ul className="py-1">
                      {suggestions.map((p, idx) => (
                        <li
                          key={idx}
                          className="px-4 py-3 text-sm hover:bg-white/10 cursor-pointer flex gap-3.5 items-center transition-colors border-b border-white/10 last:border-b-0"
                          onClick={() => {
                            const tag = p.player_tag.startsWith("#") ? p.player_tag : `#${p.player_tag}`
                            setShowSuggestions(false)
                            setSuggestions([])
                            setPlayerTag(tag)
                            handleSync(tag)
                          }}
                        >
                          <Avatar className="w-10 h-10 border border-white/20 shrink-0 shadow-sm">
                            <AvatarImage src={`https://cdn.brawlify.com/profile-icons/regular/${p.icon_id || 28000000}.png`} />
                            <AvatarFallback className="bg-primary/10"><User className="w-5 h-5 text-primary/70" /></AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col gap-1 w-full overflow-hidden">
                            <div className="flex items-center gap-2">
                              <span className="font-bold truncate text-base text-white">{p.name}</span>
                              <Badge variant="secondary" className="text-[10px] font-mono tabular-nums bg-white/10 text-[#ffe359] border-white/15 shrink-0">#{p.player_tag.replace(/^#+/, "")}</Badge>
                            </div>
                            <div className="flex items-center gap-3 text-xs font-medium tabular-nums">
                              <span className="flex items-center gap-1 text-[#ffce00] font-bold">
                                <Trophy className="w-3.5 h-3.5" />
                                {p.trophies != null ? p.trophies.toLocaleString() : 0}
                              </span>
                              {p.highest_trophies != null && p.highest_trophies > 0 && (
                                <span className="flex items-center gap-1 text-muted-foreground whitespace-nowrap">
                                  最高: {p.highest_trophies.toLocaleString()}
                                </span>
                              )}
                            </div>
                          </div>
                          {p.highest_ranked_rank > 0 && (() => {
                            const rank = getRankImage(p.highest_ranked_rank);
                            if (!rank) return null;
                            return (
                              <div className="shrink-0 flex items-center justify-center bg-white/5 rounded-full p-1" title={rank.name}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={rank.url}
                                  alt="Rank"
                                  className="w-8 h-8 object-contain drop-shadow-md"
                                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                />
                              </div>
                            );
                          })()}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="relative flex gap-2.5 sm:gap-3 w-full">
              <div className="relative flex-1 min-w-0">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#64748b] pointer-events-none" aria-hidden="true" />
                <Input
                  placeholder="クラブ名 または タグ(#CLUB123)"
                  aria-label="クラブ名またはタグ"
                  value={clubInput}
                  onChange={(e) => {
                    setClubInput(e.target.value)
                    if (e.target.value.trim().length > 0) setShowClubSuggestions(true)
                  }}
                  onCompositionEnd={(e) => {
                    const val = e.currentTarget.value
                    setClubInput(val)
                    if (val.trim().length > 0) setShowClubSuggestions(true)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                      setShowClubSuggestions(false)
                      handleSyncClub()
                    }
                  }}
                  onFocus={() => {
                    if (clubInput.trim().length > 0) setShowClubSuggestions(true)
                  }}
                  className="pl-9"
                />
              </div>
              <Button onClick={() => handleSyncClub()} disabled={loadingClub} className="shrink-0 px-5 sm:px-7">
                {loadingClub ? "検索中..." : (
                  <>
                    <Search className="w-4 h-4 mr-1.5" />
                    検索
                  </>
                )}
              </Button>

              {/* クラブサジェストドロップダウン */}
              {showClubSuggestions && (isSearchingClub || clubSuggestions.length > 0) && (
                <div className="absolute top-full left-0 w-full max-w-full mt-2 bg-[#141f3d] text-card-foreground border border-white/15 rounded-xl shadow-2xl z-[100] max-h-64 overflow-y-auto backdrop-blur-md">
                  {isSearchingClub ? (
                    <div className="p-3 text-sm text-muted-foreground text-center animate-pulse">検索中...</div>
                  ) : (
                    <ul className="py-1">
                      {clubSuggestions.map((c, idx) => (
                        <li
                          key={idx}
                          className="px-4 py-3 text-sm hover:bg-white/10 cursor-pointer flex gap-3.5 items-center transition-colors border-b border-white/10 last:border-b-0"
                          onClick={() => {
                            const tag = c.club_tag.startsWith("#") ? c.club_tag : `#${c.club_tag}`
                            setShowClubSuggestions(false)
                            setClubSuggestions([])
                            setClubInput(tag)
                            handleSyncClub(tag)
                          }}
                        >
                          <Avatar className="w-10 h-10 border border-white/20 shrink-0 shadow-sm bg-primary/10">
                            <AvatarImage src={`https://cdn.brawlify.com/club-badges/regular/${c.badge_id || 16000000}.png`} />
                            <AvatarFallback className="bg-primary/10"><Building2 className="w-5 h-5 text-primary" /></AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col gap-1 w-full overflow-hidden">
                            <div className="flex items-center gap-2">
                              <span className="font-bold truncate text-base text-white">{c.name}</span>
                              <Badge variant="secondary" className="text-[10px] font-mono tabular-nums bg-white/10 text-[#ffe359] border-white/15 shrink-0">#{c.club_tag.replace(/^#+/, "")}</Badge>
                            </div>
                            <div className="flex items-center gap-3 text-xs font-medium text-muted-foreground tabular-nums">
                              <span className="flex items-center gap-1 text-[#ffce00] font-bold">
                                <Trophy className="w-3.5 h-3.5" />
                                {c.trophies ? c.trophies.toLocaleString() : 0}
                              </span>
                              <span>必要: {c.required_trophies ? c.required_trophies.toLocaleString() : 0} 🏆</span>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="arena-tier-seg-group shrink-0" role="tablist" aria-label="検索対象切替">
          <button
            type="button"
            role="tab"
            aria-selected={searchMode === "player"}
            className={`arena-tier-seg-btn inline-flex items-center gap-1.5${searchMode === "player" ? " is-active" : ""}`}
            onClick={() => {
              setSearchMode("player")
              setErrorMsg(null)
            }}
          >
            <Users className="w-3.5 h-3.5" />
            <span>プレイヤー戦績</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={searchMode === "club"}
            className={`arena-tier-seg-btn inline-flex items-center gap-1.5${searchMode === "club" ? " is-active" : ""}`}
            onClick={() => {
              setSearchMode("club")
              setErrorMsg(null)
            }}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>クラブ分析</span>
          </button>
        </div>
      </section>

      {errorMsg && (
        <div role="alert" className="p-4 rounded-xl bg-destructive/15 text-destructive font-medium border border-destructive/30 animate-in fade-in zoom-in duration-300">
          {errorMsg}
        </div>
      )}

      {/* クラブ詳細表示カード */}
      {clubData && !errorMsg && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <section className="arena-trophy-banner">
            <div className="arena-player-identity">
              <Avatar className="w-16 h-16 sm:w-20 sm:h-20 border-2 border-[#ffce00]/40 shadow-xl bg-purple-500/15 shrink-0">
                <AvatarImage src={`https://cdn.brawlify.com/club-badges/regular/${clubData.badge_id || 16000000}.png`} />
                <AvatarFallback className="bg-purple-500/20 text-purple-300 text-2xl font-bold"><Building2 className="w-9 h-9" /></AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white truncate">{clubData.name}</h2>
                  <Badge variant="outline" className="font-mono text-xs tabular-nums border-white/20 text-[#ffe359]">#{clubData.club_tag}</Badge>
                </div>
                <p className="text-sm text-[#b6c5e2] mt-1.5 max-w-2xl">{clubData.description || "説明なし"}</p>
              </div>
            </div>

            <div className="arena-kpi-strip">
              <div className="arena-kpi-box">
                <span className="text-[11px] font-semibold text-[#b6c5e2] flex items-center gap-1">
                  <Trophy className="w-3.5 h-3.5 text-[#ffce00]" /> 総トロフィー
                </span>
                <strong className="mt-1 block text-xl sm:text-2xl font-black text-[#ffce00] tabular-nums">
                  {clubData.trophies?.toLocaleString() ?? "—"}
                </strong>
              </div>
              <div className="arena-kpi-box">
                <span className="text-[11px] font-semibold text-[#b6c5e2] flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-[#7dd3fc]" /> メンバー数
                </span>
                <strong className="mt-1 block text-xl sm:text-2xl font-black text-white tabular-nums">
                  {clubData.members?.length || 0} / 30
                </strong>
              </div>
              <div className="arena-kpi-box">
                <span className="text-[11px] font-semibold text-[#b6c5e2] block">必要トロフィー</span>
                <strong className="mt-1 block text-xl sm:text-2xl font-black text-[#cbd5e1] tabular-nums">
                  {clubData.required_trophies?.toLocaleString() ?? "—"}
                </strong>
              </div>
            </div>
          </section>

          <Card className="border-white/10">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" /> 所属メンバー一覧
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {clubData.members && clubData.members.length > 0 ? (
                  clubData.members.map((m: any, idx: number) => (
                    <button
                      type="button"
                      key={idx}
                      onClick={() => {
                        setSearchMode("player")
                        setPlayerTag(m.tag)
                        handleSync(m.tag)
                      }}
                      className="flex items-center gap-3 p-3 rounded-xl bg-[rgba(12,19,38,0.85)] hover:bg-[rgba(24,36,70,0.9)] border border-white/10 hover:border-[#ffce00]/50 transition-all cursor-pointer group text-left min-w-0"
                    >
                      <Avatar className="w-10 h-10 border border-white/15 shrink-0 group-hover:scale-105 transition-transform">
                        <AvatarImage src={`https://cdn.brawlify.com/profile-icons/regular/${m.icon?.id || m.icon_id || 28000000}.png`} />
                        <AvatarFallback className="bg-primary/10 font-bold"><User className="w-5 h-5 text-primary/70" /></AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col overflow-hidden min-w-0 flex-1">
                        <span className="font-bold text-sm truncate text-white group-hover:text-[#ffce00] transition-colors" title={m.name}>{m.name}</span>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 tabular-nums">
                          <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-white/10 text-[#cbd5e1]">{translateRole(m.role)}</span>
                          <span className="font-mono text-[#ffce00] font-bold">{m.trophies?.toLocaleString()} 🏆</span>
                        </div>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="col-span-full py-8 text-center text-muted-foreground">メンバー情報が見つかりませんでした。</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}


      {data && !errorMsg && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 mt-4">
          {data.source === "saved" && (
            <p role="status" className="rounded-xl border border-primary/25 bg-primary/10 p-4 text-sm">
              最新の戦績を取得できなかったため、保存済みのプロフィールと戦績を表示しています。
            </p>
          )}
          {data.profile && (
            /* Loaded Player Hero */
            <div className="arena-player-hero">
              <section className="arena-trophy-banner" aria-label="プレイヤープロフィール">
                <div className="arena-player-identity">
                  <Avatar className="w-16 h-16 sm:w-20 sm:h-20 border-2 border-[#ffce00]/45 shadow-xl shrink-0">
                    <AvatarImage src={`https://cdn.brawlify.com/profile-icons/regular/${data.profile?.icon_id || 28000000}.png`} />
                    <AvatarFallback className="bg-primary/10 text-2xl font-bold"><User className="w-9 h-9 text-primary/70" /></AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white truncate">{data.profile?.name}</h2>
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-white/10 border border-white/15 text-[#cbd5e1] tabular-nums">
                        {data.player_tag}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      {data.source !== "saved" && (() => {
                        const hasClub = Boolean(data.profile?.club_name && data.profile.club_name !== "No Club" && data.profile.club_name !== "クラブ未所属");
                        if (hasClub) {
                          return (
                            <button
                              type="button"
                              className="text-xs px-3 py-1 rounded-full font-semibold transition-all inline-flex items-center gap-1.5 bg-purple-500/15 text-purple-200 border border-purple-400/30 hover:bg-purple-500/25 hover:border-purple-300/60"
                              onClick={() => {
                                const tagOrName = data.profile?.club_tag || data.profile?.club_name || "";
                                if (!tagOrName) return;
                                setSearchMode("club");
                                setClubInput(tagOrName);
                                handleSyncClub(tagOrName);
                              }}
                              title="クリックしてクラブ詳細を表示"
                            >
                              <Building2 className="w-3.5 h-3.5" />
                              <span>所属クラブ: {data.profile?.club_name} →</span>
                            </button>
                          );
                        }
                        return (
                          <span className="text-xs px-2.5 py-1 rounded-full font-semibold inline-flex items-center gap-1.5 bg-white/10 text-[#b6c5e2]">
                            <Building2 className="w-3.5 h-3.5" />
                            <span>クラブ未所属</span>
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                <div className="arena-kpi-strip">
                  <div className="arena-kpi-box">
                    <span className="text-[11px] font-semibold text-[#b6c5e2] flex items-center gap-1">
                      <Trophy className="w-3.5 h-3.5 text-[#ffce00]" /> 現在トロフィー
                    </span>
                    <strong className="mt-1 block text-xl sm:text-2xl font-black text-[#ffce00] tabular-nums">
                      {data.profile?.trophies?.toLocaleString() ?? "—"}
                    </strong>
                  </div>
                  <div className="arena-kpi-box">
                    <span className="text-[11px] font-semibold text-[#b6c5e2] block">最高トロフィー</span>
                    <strong className="mt-1 block text-xl sm:text-2xl font-black text-white tabular-nums">
                      {data.profile?.highest_trophies?.toLocaleString() ?? "—"}
                    </strong>
                  </div>
                  <div className="arena-kpi-box">
                    <span className="text-[11px] font-semibold text-[#b6c5e2] block">3v3 勝利数</span>
                    <strong className="mt-1 block text-xl sm:text-2xl font-black text-[#7dd3fc] tabular-nums">
                      {data.profile?.["3v3_victories"]?.toLocaleString() ?? "—"}
                    </strong>
                  </div>
                  <div className="arena-kpi-box">
                    <span className="text-[11px] font-semibold text-[#b6c5e2] block">レベル</span>
                    <strong className="mt-1 block text-xl sm:text-2xl font-black text-[#34d399] tabular-nums">
                      {data.profile?.level != null ? `Lv.${data.profile.level}` : "—"}
                    </strong>
                  </div>
                </div>
              </section>

              {data.profile?.ranked_elo ? (
                <aside className="arena-rank-pedestal" aria-label="ガチバトルランク">
                  {(() => {
                    const rankInfo = data.profile.ranked_rank > 0 ? getRankImage(data.profile.ranked_rank) : null;
                    return (
                      <>
                        <div className="arena-rank-emblem-box relative">
                          {rankInfo ? (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={rankInfo.url}
                                alt={rankInfo.name}
                                className="w-full h-full object-contain"
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                              />
                              {rankInfo.tier && (
                                <div className="absolute -bottom-1 -right-1 bg-[#090e1d]/95 px-1.5 py-0.5 rounded text-[11px] font-black text-[#ffce00] border border-[#ffce00]/40 shadow-md leading-none tabular-nums">
                                  {rankInfo.tier}
                                </div>
                              )}
                            </>
                          ) : (
                            <Swords className="w-8 h-8 text-[#a855f7]" aria-hidden="true" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-[11px] font-mono uppercase tracking-widest text-[#b6c5e2]">RANKED EMBLEM</div>
                          <div className="text-base font-extrabold text-white mt-0.5">
                            {rankInfo ? `${rankInfo.name}${rankInfo.tier ? ` ${rankInfo.tier}` : ""}` : "ガチバトル"}
                          </div>
                          <div className="text-3xl font-black text-[#ffce00] tabular-nums leading-tight mt-1">
                            {data.profile.ranked_elo.toLocaleString()}
                            <span className="text-xs font-mono text-[#b6c5e2] ml-1.5">ELO</span>
                          </div>
                          <div className="text-xs text-[#94a3b8] tabular-nums mt-1">
                            最高: {data.profile.highest_ranked_elo != null ? data.profile.highest_ranked_elo.toLocaleString() : 0}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </aside>
              ) : (
                <aside className="arena-rank-pedestal" aria-label="トロフィーサマリー">
                  <div className="arena-rank-emblem-box">
                    <Trophy className="w-8 h-8 text-[#ffce00]" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-mono uppercase tracking-widest text-[#b6c5e2]">TROPHY SUMMARY</div>
                    <div className="text-base font-extrabold text-white mt-0.5">キャリア最高記録</div>
                    <div className="text-3xl font-black text-[#ffce00] tabular-nums leading-tight mt-1">
                      {data.profile?.highest_trophies?.toLocaleString() ?? "—"}
                    </div>
                    <div className="text-xs text-[#94a3b8] tabular-nums mt-1">
                      3v3勝利: {data.profile?.["3v3_victories"]?.toLocaleString() ?? "—"}
                    </div>
                  </div>
                </aside>
              )}
            </div>
          )}
          <PlayerAutoSync key={`auto-sync-${data.player_tag}`} playerTag={data.player_tag} onCollected={() => setAnalysisRevision(value => value + 1)} />
          <PlayerAnalysis key={data.player_tag} playerTag={data.player_tag} revision={analysisRevision} />

        <Tabs defaultValue="battles" className="w-full mt-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <TabsList className="grid w-full grid-cols-2 mb-6 bg-secondary/50 p-1">
            <TabsTrigger value="battles" className="rounded-md font-semibold text-md">バトル履歴</TabsTrigger>
            <TabsTrigger value="characters" className="rounded-md font-semibold text-md">キャラクター</TabsTrigger>
          </TabsList>

          <TabsContent value="battles" className="space-y-6">
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2 text-primary/80">
              ⚔️ 直近のバトル履歴
            </h2>
            {data.recent_battles && data.recent_battles.length > 0 ? (
            <Tabs defaultValue="all" value={battleTab} onValueChange={setBattleTab} className="w-full">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                <TabsList className="bg-background/40">
                  <TabsTrigger value="all">すべて</TabsTrigger>
                  <TabsTrigger value="normal">通常マッチ</TabsTrigger>
                  <TabsTrigger value="ranked">ガチバトル</TabsTrigger>
                  <TabsTrigger value="friendly">フレンド</TabsTrigger>
                </TabsList>

                {/* 高度なサブフィルター（勝敗＆モード絞り込み） */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1 bg-secondary/40 p-1 rounded-lg border border-border/40">
                    <Button 
                      variant={resultFilter === "all" ? "default" : "ghost"} 
                      size="sm" 
                      className="h-9 text-xs px-2.5 font-bold"
                      onClick={() => setResultFilter("all")}
                    >
                      全結果
                    </Button>
                    <Button 
                      variant={resultFilter === "victory" ? "default" : "ghost"} 
                      size="sm" 
                      className="h-9 text-xs px-2.5 font-bold text-green-500 hover:text-green-400"
                      onClick={() => setResultFilter("victory")}
                    >
                      勝利のみ
                    </Button>
                    <Button 
                      variant={resultFilter === "defeat" ? "default" : "ghost"} 
                      size="sm" 
                      className="h-9 text-xs px-2.5 font-bold text-red-500 hover:text-red-400"
                      onClick={() => setResultFilter("defeat")}
                    >
                      敗北のみ
                    </Button>
                  </div>

                  {/* モード別ドロップダウン */}
                  {(() => {
                    const uniqueModes = Array.from(new Set(data.recent_battles.map((b: any) => b.mode).filter(Boolean)));
                    if (uniqueModes.length === 0) return null;
                    return (
                      <Select value={modeFilter} onValueChange={(val) => setModeFilter(val || "all")}>
                        <SelectTrigger className="w-[140px] h-9 text-xs bg-secondary/40 border border-border/40">
                          <SelectValue placeholder="モード絞り込み" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">全モード</SelectItem>
                          {uniqueModes.map((m: string) => (
                            <SelectItem key={m} value={m}>{translateMode(m)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    );
                  })()}
                </div>
              </div>

            <Card className="bg-card/40 backdrop-blur-md border-primary/20 shadow-xl overflow-hidden p-2">
              <TabsContent value={battleTab} className="mt-0 outline-none">
              <ScrollArea className="h-[600px] pr-4">
                <div className="space-y-3">
                  {data.recent_battles && (() => {
                    const filteredBattles = data.recent_battles.filter((b: any) => {
                      // 1. タイプフィルター
                      if (battleTab === "ranked" && b.type !== "soloRanked" && b.type !== "teamRanked") return false;
                      if (battleTab === "friendly" && b.type !== "friendly") return false;
                      if (battleTab === "normal" && (b.type === "friendly" || b.type === "soloRanked" || b.type === "teamRanked")) return false;
                      
                      // 2. 勝敗フィルター
                      if (resultFilter === "victory" && b.result !== "victory") return false;
                      if (resultFilter === "defeat" && b.result !== "defeat") return false;
                      
                      // 3. モードフィルター
                      if (modeFilter !== "all" && b.mode !== modeFilter) return false;
                      
                      return true;
                    });
                    
                    if (filteredBattles.length === 0) {
                      return <p className="text-center text-muted-foreground p-8">このカテゴリーのバトル履歴はありません。</p>
                    }
                    
                    return filteredBattles.map((battle: any, i: number) => {
                      const mainBInfo = getBrawlerInfo(battle.hero);
                      const isRanked = battle.type === "soloRanked" || battle.type === "teamRanked";
                      const isFriendly = battle.type === "friendly";
                      
                      let scoreDisplay = null;
                      if (isRanked) {
                        scoreDisplay = <p className="font-bold text-sm text-purple-400 drop-shadow-sm px-2 py-1 bg-purple-500/10 rounded-md border border-purple-500/20">ランク戦</p>;
                      } else if (isFriendly) {
                        scoreDisplay = <p className="font-bold text-sm text-gray-400 drop-shadow-sm">フレンド</p>;
                      } else if (battle.trophy_change != null || data.source !== "saved") {
                        scoreDisplay = (
                          <p className={`font-bold text-xl drop-shadow-sm ${battle.trophy_change > 0 ? 'text-green-500' : battle.trophy_change < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                            {battle.trophy_change > 0 ? '+' : ''}{battle.trophy_change} 🏆
                          </p>
                        );
                      }

                      return (
                        <Card key={i} className={`arena-match-card ${battle.result === 'victory' ? 'is-win' : battle.result === 'defeat' ? 'is-loss' : 'is-draw'} p-0 gap-0 overflow-hidden transition-colors`}>
                      {/* Header section */}
                       <div className="p-3 border-b border-white/10 flex justify-between items-center bg-white/[0.03]">
                         <div className="flex items-center gap-3 min-w-0 flex-1">
                           <div className="min-w-0">
                             <div className="flex items-center gap-2 mb-1">
                               <Badge variant={battle.result === 'victory' ? 'default' : battle.result === 'defeat' ? 'destructive' : 'outline'} className="uppercase text-[10px] px-2 font-bold tracking-wider">
                                 {battle.result === 'victory' ? '勝利' : battle.result === 'defeat' ? '敗北' : '引き分け'}
                               </Badge>
                               <span className="text-[11px] text-muted-foreground font-medium tracking-wide tabular-nums">{formatBattleTime(battle.time)}</span>
                             </div>
                             <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                               {/* eslint-disable-next-line @next/next/no-img-element */}
                               <img src={getModeIconUrl(battle.mode)} alt={battle.mode} className="w-4 h-4 object-contain drop-shadow-md" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                               <span className="font-semibold text-foreground/90">{translateMode(battle.mode)}</span>
                               <span className="opacity-40">|</span>
                               <span className="truncate">{translateMap(battle.map)}</span>
                             </div>
                           </div>
                        </div>
                        <div className="text-right flex items-center gap-3 sm:gap-4 shrink-0">
                          <Avatar className="w-9 h-9 sm:w-12 sm:h-12 border border-white/20 shadow-sm">
                            <AvatarImage src={mainBInfo.imageUrl} />
                            <AvatarFallback className="bg-primary/10"><User className="w-5 h-5 text-primary/70" /></AvatarFallback>
                          </Avatar>
                          <div className="w-16 sm:w-20 text-right flex justify-end tabular-nums">
                            {scoreDisplay}
                          </div>
                        </div>
                      </div>
                      
                      {/* Teams section */}
                      <div className={data.source === "saved" ? "hidden" : "p-3 grid grid-cols-1 sm:grid-cols-2 gap-4 bg-black/15"}>
                        {/* My Team */}
                        <div className="space-y-3 relative">
                          <p className="text-xs font-bold text-[#7dd3fc] tracking-widest border-b border-white/10 pb-1.5 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-[#38bdf8]" />
                            味方チーム
                          </p>
                          <div className="flex flex-col gap-2">
                            {battle.my_team && battle.my_team.map((p: any, idx: number) => {
                              const bInfo = getBrawlerInfo(p.brawler);
                              const isMe = (p.tag || "").replace(/^#+/, "").toUpperCase().replace(/O/g, "0") === data.player_tag.replace(/^#+/, "").toUpperCase().replace(/O/g, "0");
                              return (
                                <div 
                                  key={idx} 
                                  onClick={() => handleSync(p.tag)}
                                  className={`flex items-center gap-3 p-1.5 rounded-xl transition-colors group cursor-pointer ${isMe ? 'bg-[#ffce00]/10 border border-[#ffce00]/30' : 'hover:bg-white/5 border border-transparent'}`}
                                >
                                  <Avatar className={`w-10 h-10 shadow-sm transition-transform group-hover:scale-105 ${isMe ? 'border border-[#ffce00] ring-2 ring-[#ffce00]/25' : 'border border-white/15'}`}>
                                    <AvatarImage src={bInfo.imageUrl} />
                                    <AvatarFallback className="bg-primary/10"><User className="w-5 h-5 text-primary/70" /></AvatarFallback>
                                  </Avatar>
                                  <div className="flex flex-col overflow-hidden">
                                    <span className={`text-sm truncate max-w-[140px] font-bold tracking-wide ${isMe ? 'text-[#ffce00]' : 'text-foreground/95'}`} title={p.name}>
                                      {p.name}
                                    </span>
                                    <span className="text-[11px] text-muted-foreground group-hover:text-foreground/80 transition-colors font-medium">{bInfo.nameJa}</span>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                        {/* Opponent Teams */}
                        <div className="space-y-3 border-t sm:border-t-0 sm:border-l border-white/10 pt-3 sm:pt-0 sm:pl-4 relative">
                          <p className="text-xs font-bold text-[#fda4af] tracking-widest border-b border-white/10 pb-1.5 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-[#fb7185]" />
                            相手チーム
                          </p>
                          <div className="flex flex-col gap-2">
                            {battle.opponent_teams && battle.opponent_teams.map((team: any, t_idx: number) => (
                              <div key={t_idx} className="space-y-2">
                                {Array.isArray(team) && team.map((p: any, idx: number) => {
                                  const bInfo = getBrawlerInfo(p.brawler);
                                  return (
                                    <div 
                                      key={`${t_idx}-${idx}`} 
                                      onClick={() => handleSync(p.tag)}
                                      className="flex items-center gap-3 p-1.5 rounded-xl hover:bg-white/5 transition-colors group cursor-pointer border border-transparent"
                                    >
                                      <Avatar className="w-10 h-10 border border-rose-400/30 shadow-sm transition-transform group-hover:scale-105">
                                        <AvatarImage src={bInfo.imageUrl} />
                                        <AvatarFallback className="bg-destructive/10"><User className="w-4 h-4 text-destructive/70" /></AvatarFallback>
                                      </Avatar>
                                      <div className="flex flex-col overflow-hidden">
                                        <span className="text-sm truncate max-w-[140px] font-bold tracking-wide text-foreground/95" title={p.name}>{p.name}</span>
                                        <span className="text-[11px] text-muted-foreground group-hover:text-foreground/80 transition-colors font-medium">{bInfo.nameJa}</span>
                                      </div>
                                    </div>
                                  )
                                })}
                                {t_idx < battle.opponent_teams.length - 1 && <Separator className="my-2 opacity-40 bg-destructive/30" />}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                        </Card>
                      )
                    })
                  })()}
                </div>
              </ScrollArea>
              </TabsContent>
            </Card>
            </Tabs>
            ) : (
              <div className="py-12 text-center text-muted-foreground bg-secondary/20 rounded-xl border border-dashed">
                {data.source === "profile-only" ? "ブロスタのAPIから、このプレイヤーのバトル履歴を取得できませんでした。" : "バトル履歴がありません。"}
              </div>
            )}
          </TabsContent>
          <TabsContent value="characters" className="space-y-6">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span id="player-brawler-sort-label" className="text-sm font-semibold text-muted-foreground">並び替え</span>
              <Select value={brawlerSort} onValueChange={(value) => { if (value && Object.hasOwn(playerBrawlerSorts, value)) setBrawlerSort(value as PlayerBrawlerSort) }}>
                <SelectTrigger aria-labelledby="player-brawler-sort-label" className="w-[220px] h-10 bg-secondary/40 border border-border/40">
                  <SelectValue>{playerBrawlerSorts[brawlerSort]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(playerBrawlerSorts).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {sortPlayerBrawlers(Array.isArray(data.brawlers) ? data.brawlers : [], brawlerSort).map((brawler) => {
                const maxPower = 11;
                const power = brawler.power || 1;
                const powerRatio = (power / maxPower) * 100;
                const gadgets = Array.isArray(brawler.gadgets) ? brawler.gadgets : [];
                const starPowers = Array.isArray(brawler.starPowers) ? brawler.starPowers : [];
                const gears = Array.isArray(brawler.gears) ? brawler.gears : [];
                const hyperCharges = Array.isArray(brawler.hyperCharges) ? brawler.hyperCharges : [];
                
                return (
                  // Detail pages run in Pages Functions, outside Next's static RSC router.
                  // eslint-disable-next-line @next/next/no-html-link-for-pages
                  <a key={brawler.id} href={brawlerPath(brawler.name)} aria-label={`${getBrawlerInfo(brawler.name).nameJa}の詳細を見る`} className="block min-w-0 rounded-xl focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2">
                  <Card className="h-full overflow-hidden border-white/10 bg-[rgba(14,22,44,0.9)] hover:border-[#ffce00]/60 transition-colors">
                    <div className="p-3 pb-2 flex gap-3 items-center border-b border-white/10">
                      <div className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img 
                          src={`https://cdn.brawlify.com/brawlers/borders/${brawler.id}.png`} 
                          alt={brawler.name} 
                          className="w-12 h-12 rounded-lg border border-white/20 shadow-sm bg-[#090e1d]/70 object-cover"
                          onError={(e) => { e.currentTarget.src = 'https://cdn.brawlify.com/brawler/shelly.png'; }}
                        />
                        <div className="absolute -bottom-1 -right-1 bg-[#ffce00] text-[#0f1526] text-[9px] font-black w-5 h-5 rounded-sm flex items-center justify-center border border-[#090e1d] shadow-sm tabular-nums">
                          {power}
                        </div>
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <h4 className="font-extrabold text-lg truncate tracking-tight text-white">{getBrawlerInfo(brawler.name).nameJa}</h4>
                        <div className="flex items-center gap-1.5 mt-0.5 text-xs font-semibold text-muted-foreground tabular-nums">
                          <Trophy className="w-3.5 h-3.5 text-[#ffce00]" />
                          <span className="text-[#ffce00]">{brawler.trophies || 0}</span>
                          <span className="opacity-50">/</span>
                          <span>{brawler.highestTrophies || brawler.trophies || 0}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="px-3 py-2.5 bg-white/[0.02] flex flex-col gap-2">
                      <div className="flex items-center justify-between text-xs font-medium tabular-nums">
                        <span className="text-muted-foreground">パワーレベル</span>
                        <span className={power === 11 ? "text-[#34d399] font-bold" : ""}>{power} / {maxPower}</span>
                      </div>
                      <Progress value={powerRatio} className="h-1.5" />
                      
                      <div className="grid grid-cols-4 gap-2 mt-2 pt-2 border-t border-border/50">
                        {/* Gadgets */}
                        <div className="flex flex-col gap-1 items-center">
                          <span className="text-[9px] font-bold text-green-500">ガジェット</span>
                          <div className="flex gap-1 justify-center flex-wrap">
                            {gadgets.length > 0 ? gadgets.map((g) => (
                              <img key={g.id} src={`https://cdn.brawlify.com/gadgets/regular/${g.id}.png`} alt={g.name} className="w-6 h-6 rounded-full border border-green-500/50 shadow-sm" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                            )) : <span className="text-muted-foreground text-[10px]">-</span>}
                          </div>
                        </div>
                        {/* Star Powers */}
                        <div className="flex flex-col gap-1 items-center">
                          <span className="text-[9px] font-bold text-yellow-500">スターパワー</span>
                          <div className="flex gap-1 justify-center flex-wrap">
                            {starPowers.length > 0 ? starPowers.map((s) => (
                              <img key={s.id} src={`https://cdn.brawlify.com/star-powers/regular/${s.id}.png`} alt={s.name} className="w-6 h-6 rounded-full border border-yellow-500/50 shadow-sm" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                            )) : <span className="text-muted-foreground text-[10px]">-</span>}
                          </div>
                        </div>
                        {/* Gears */}
                        <div className="flex flex-col gap-1 items-center">
                          <span className="text-[9px] font-bold text-blue-500">ギア</span>
                          <div className="flex gap-1 justify-center flex-wrap">
                            {gears.length > 0 ? gears.map((g) => (
                              <img key={g.id} src={`https://cdn.brawlify.com/gears/regular/${g.id}.png`} alt={g.name} className="w-6 h-6 rounded-full border border-blue-500/50 shadow-sm" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                            )) : <span className="text-muted-foreground text-[10px]">-</span>}
                          </div>
                        </div>
                        {/* Hypercharge */}
                        <div className="flex flex-col gap-1 items-center">
                          <span className="text-[9px] font-bold text-purple-500">ハイパー</span>
                          <div className="flex gap-1 justify-center flex-wrap">
                            {hyperCharges.length > 0 ? hyperCharges.map((h) => (
                              <Avatar key={h.id} size="sm" title={h.name} className="rounded-full border border-purple-500/50 shadow-sm">
                                {/* Brawlify does not serve hypercharge assets; BSInfo uses the API item IDs. */}
                                <AvatarImage src={`https://cdn.bsinfox.com/hypercharges/${h.id}.png`} alt={h.name} className="rounded-full object-contain" />
                                <AvatarFallback role="img" aria-label={h.name} className="rounded-full bg-purple-600 text-white">
                                  <Zap className="w-4 h-4" aria-hidden="true" />
                                </AvatarFallback>
                              </Avatar>
                            )) : <span className="text-muted-foreground text-[10px]">-</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                  </a>
                )
              })}
              {(!data.brawlers || data.brawlers.length === 0) && (
                <div className="col-span-full py-12 text-center text-muted-foreground bg-secondary/20 rounded-xl border border-dashed">
                  キャラクターデータがありません。
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
        </div>
      )}
    
      {/* プレイヤー名検索 複数候補選択モーダル */}
      <Sheet open={candidateModalOpen} onOpenChange={setCandidateModalOpen}>
        <SheetContent side="bottom" className="sm:max-w-lg mx-auto rounded-t-3xl max-h-[85vh] p-0 flex flex-col border-white/15">
          <SheetHeader className="p-6 pb-3 border-b border-white/10 text-left">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              <SheetTitle className="text-lg font-bold text-white">
                プレイヤーの選択（{candidates.length}件の候補）
              </SheetTitle>
            </div>
            <SheetDescription className="text-xs text-[#b6c5e2]">
              該当するプレイヤーを選択して戦績を表示します。
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-4 space-y-2 divide-y divide-white/10">
            {candidates.map((p: any) => {
              const pTag = p.player_tag || p.tag;
              const rank = p.highest_ranked_rank > 0 ? getRankImage(p.highest_ranked_rank) : null;
              return (
                <button
                  key={pTag}
                  type="button"
                  onClick={() => {
                    setCandidateModalOpen(false);
                    handleSync(pTag);
                  }}
                  className="w-full pt-2 first:pt-0 p-3 flex items-center justify-between rounded-2xl hover:bg-white/10 border border-transparent hover:border-white/15 transition-all text-left group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="w-12 h-12 rounded-xl border border-white/15 shadow-md shrink-0">
                      <AvatarImage src={`https://cdn.brawlify.com/profile-icons/regular/${p.icon_id || 28000000}.png`} />
                      <AvatarFallback>{p.name?.[0]}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="font-bold text-base text-white group-hover:text-[#ffce00] transition-colors truncate">
                        {p.name}
                      </div>
                      <div className="text-xs text-[#94a3b8] font-mono tabular-nums">
                        #{pTag.replace(/^#/, "")}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {rank && (
                      <div className="flex items-center gap-1.5 bg-white/10 px-2.5 py-1 rounded-xl border border-white/15" title={`最高ランク: ${rank.name} ${rank.tier}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={rank.url} alt={rank.name} className="w-6 h-6 object-contain" />
                        <span className="text-xs font-bold text-white">{rank.tier}</span>
                      </div>
                    )}
                    <div className="text-right tabular-nums">
                      <div className="font-extrabold text-sm text-[#ffce00]">
                        🏆 {p.trophies?.toLocaleString()}
                      </div>
                      {p.highest_trophies > 0 && (
                        <div className="text-[11px] text-[#94a3b8]">
                          最高 {p.highest_trophies?.toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>

    </div>
  )
}
