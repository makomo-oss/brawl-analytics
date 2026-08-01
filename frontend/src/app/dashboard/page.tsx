"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Search, TrendingUp, AlertTriangle, Lightbulb, Trophy, Swords, Star, Building2, Shield, Users, User } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { getBrawlerInfo } from "@/lib/brawlers"
import { translateMode, translateMap, getModeIconUrl } from "@/lib/translations"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { API_URL } from "@/lib/config"

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

function getRankImage(rankValue: any): { name: string; url: string; tier: string } | null {
  try {
    const num = Number(rankValue);
    if (isNaN(num) || num <= 0) return null;
    if (num >= 19) return { name: "MASTERS", url: "https://cdn.brawlify.com/ranked/regular/Masters.png", tier: "" };
    
    const tiers = ["Bronze", "Silver", "Gold", "Diamond", "Mythic", "Legendary"];
    const tierIndex = Math.floor((num - 1) / 3);
    if (tierIndex < 0 || tierIndex >= tiers.length || !tiers[tierIndex]) {
      return null;
    }
    
    const subTier = ((num - 1) % 3) + 1; // 1, 2, 3
    const numerals = ["I", "II", "III"];
    
    return {
      name: tiers[tierIndex].toUpperCase(),
      url: `https://cdn.brawlify.com/ranked/regular/${tiers[tierIndex]}.png`,
      tier: numerals[subTier - 1] || ""
    };
  } catch {
    return null;
  }
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

export default function DashboardPage() {
  const [searchMode, setSearchMode] = useState<"player" | "club">("player")
  const [playerTag, setPlayerTag] = useState("")
  const [clubInput, setClubInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [loadingClub, setLoadingClub] = useState(false)
  const [data, setData] = useState<DashboardData | null>(null)
  const [clubData, setClubData] = useState<any | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [battleTab, setBattleTab] = useState("battles")

  // プレイヤー名検索サジェスト用ステート
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [isSearching, setIsSearching] = useState(false)

  // クラブ名検索サジェスト用ステート
  const [clubSuggestions, setClubSuggestions] = useState<any[]>([])
  const [showClubSuggestions, setShowClubSuggestions] = useState(false)
  const [isSearchingClub, setIsSearchingClub] = useState(false)

  const searchContainerRef = useRef<HTMLDivElement>(null)

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

  const handleSync = async (overrideTag?: string) => {
    const rawInput = (overrideTag || playerTag || "").trim()
    if (!rawInput) return
    
    setShowSuggestions(false)
    setSuggestions([])
    setLoading(true)
    setErrorMsg(null)
    setData(null)
    setClubData(null)
    
    try {
      let finalTag = rawInput
      const cleanInput = rawInput.replace(/^#+/, "").trim()
      const isTagFormat = /^[A-Za-z0-9]{3,15}$/.test(cleanInput)
      
      if (!isTagFormat && !overrideTag) {
        // 名前入力の場合は事前検索して最初のプレイヤーのタグを使用
        try {
          const searchRes = await fetch(`${API_URL}/player/search?q=${encodeURIComponent(rawInput)}`)
          if (searchRes.ok) {
            const results = await searchRes.json()
            if (Array.isArray(results) && results.length > 0 && results[0]?.player_tag) {
              const formattedTag = `#${results[0].player_tag.replace(/^#+/, "")}`
              finalTag = formattedTag
              setPlayerTag(formattedTag)
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

      const res = await fetch(`${API_URL}/player/${encodeURIComponent(finalTag.replace(/^#+/, ""))}/dashboard`)
      if (!res.ok) {
        if (res.status === 404) {
          setErrorMsg("そのプレイヤーIDは存在しません。")
        } else {
          setErrorMsg("データの取得に失敗しました。")
        }
        return
      }
      const result = await res.json()
      if (result.error) {
        setErrorMsg(result.error)
        return
      }
      setData(result)
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
    setLoadingClub(true)
    setErrorMsg(null)
    setData(null)
    setClubData(null)
    
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

      const res = await fetch(`${API_URL}/club/${encodeURIComponent(finalTag.replace(/^#+/, ""))}`)
      if (!res.ok) {
        if (res.status === 404) {
          setErrorMsg("そのクラブは存在しません。")
        } else {
          setErrorMsg("クラブデータの取得に失敗しました。")
        }
        return
      }
      const result = await res.json()
      setClubData(result)
    } catch (error) {
      console.error("Fetch club error", error)
      setErrorMsg("ネットワークエラーが発生しました。")
    } finally {
      setLoadingClub(false)
    }
  }


  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          マイダッシュボード
        </h1>
        <p className="text-muted-foreground text-lg">
          個人の戦績をメタ環境と比較し、勝率を上げるためのインサイトを獲得します。
        </p>
      </div>

      <Card className="relative z-50 bg-card border-primary/20 shadow-sm overflow-visible">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle>{searchMode === "player" ? "プレイヤー同期" : "クラブ検索"}</CardTitle>
            <div className="flex bg-secondary/80 p-1 rounded-lg border border-primary/10">
              <Button
                variant={searchMode === "player" ? "default" : "ghost"}
                size="sm"
                className="h-8 text-xs font-semibold gap-1.5"
                onClick={() => {
                  setSearchMode("player")
                  setErrorMsg(null)
                }}
              >
                <Users className="w-3.5 h-3.5" />
                プレイヤー
              </Button>
              <Button
                variant={searchMode === "club" ? "default" : "ghost"}
                size="sm"
                className="h-8 text-xs font-semibold gap-1.5"
                onClick={() => {
                  setSearchMode("club")
                  setErrorMsg(null)
                }}
              >
                <Building2 className="w-3.5 h-3.5" />
                クラブ
              </Button>
            </div>
          </div>
          <CardDescription>
            {searchMode === "player" 
              ? "Brawl Starsのプレイヤー名またはタグを入力して最新データを取得します。"
              : "クラブ名またはクラブタグ(#CLUB123)を入力してクラブ情報とメンバーを検索します。"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 max-w-md relative z-50" ref={searchContainerRef}>
            {searchMode === "player" ? (
              <div className="relative flex gap-4 w-full">
                <Input 
                  placeholder="プレイヤー名 または タグ(#Q2LL9G8)" 
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
                  className="bg-background"
                />
                <Button onClick={() => handleSync()} disabled={loading} className="px-8 shadow-lg shadow-primary/20">
                  {loading ? "取得中..." : (
                    <>
                      <Search className="w-4 h-4 mr-2" />
                      同期
                    </>
                  )}
                </Button>
                
                {/* プレイヤーサジェストドロップダウン */}
                {showSuggestions && (isSearching || suggestions.length > 0) && (
                  <div className="absolute top-full left-0 w-full min-w-[320px] max-w-full mt-2 bg-card text-card-foreground border border-border rounded-md shadow-2xl z-[100] max-h-64 overflow-y-auto">
                    {isSearching ? (
                      <div className="p-3 text-sm text-muted-foreground text-center animate-pulse">検索中...</div>
                    ) : (
                      <ul className="py-1">
                        {suggestions.map((p, idx) => (
                          <li 
                            key={idx} 
                            className="px-4 py-3 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer flex gap-4 items-center transition-colors border-b last:border-b-0"
                            onClick={() => {
                              const tag = p.player_tag.startsWith("#") ? p.player_tag : `#${p.player_tag}`
                              setShowSuggestions(false)
                              setSuggestions([])
                              setPlayerTag(tag)
                              handleSync(tag)
                            }}
                          >
                            <Avatar className="w-10 h-10 border-2 border-primary/20 shrink-0 shadow-sm">
                              <AvatarImage src={`https://cdn.brawlify.com/profile-icons/regular/${p.icon_id || 28000000}.png`} />
                              <AvatarFallback className="bg-primary/10"><User className="w-5 h-5 text-primary/70" /></AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col gap-1.5 w-full overflow-hidden">
                              <div className="flex items-center gap-2">
                                <span className="font-bold truncate text-base">{p.name}</span>
                                <Badge variant="secondary" className="text-[10px] font-mono bg-primary/10 text-primary border-primary/20 shrink-0">#{p.player_tag.replace(/^#+/, "")}</Badge>
                              </div>
                              <div className="flex items-center gap-3 text-xs font-medium">
                                <span className="flex items-center gap-1 text-yellow-600 dark:text-yellow-500 font-bold">
                                  <Trophy className="w-3.5 h-3.5" />
                                  {p.trophies != null ? p.trophies.toLocaleString() : 0}
                                </span>
                                {p.highest_trophies != null && p.highest_trophies > 0 && (
                                  <span className="flex items-center gap-1 text-muted-foreground opacity-80 whitespace-nowrap">
                                    最高: {p.highest_trophies.toLocaleString()}
                                  </span>
                                )}
                              </div>
                            </div>
                            {p.highest_ranked_rank > 0 && (() => {
                              const rank = getRankImage(p.highest_ranked_rank);
                              if (!rank) return null;
                              return (
                                <div className="shrink-0 flex items-center justify-center bg-black/5 dark:bg-white/5 rounded-full p-1" title={rank.name}>
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
              <div className="relative flex gap-4 w-full">
                <Input 
                  placeholder="クラブ名 または タグ(#CLUB123)" 
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
                  className="bg-background"
                />
                <Button onClick={() => handleSyncClub()} disabled={loadingClub} className="px-8 shadow-lg shadow-primary/20">
                  {loadingClub ? "検索中..." : (
                    <>
                      <Search className="w-4 h-4 mr-2" />
                      検索
                    </>
                  )}
                </Button>

                {/* クラブサジェストドロップダウン */}
                {showClubSuggestions && (isSearchingClub || clubSuggestions.length > 0) && (
                  <div className="absolute top-full left-0 w-full min-w-[320px] max-w-full mt-2 bg-card text-card-foreground border border-border rounded-md shadow-2xl z-[100] max-h-64 overflow-y-auto">
                    {isSearchingClub ? (
                      <div className="p-3 text-sm text-muted-foreground text-center animate-pulse">検索中...</div>
                    ) : (
                      <ul className="py-1">
                        {clubSuggestions.map((c, idx) => (
                          <li 
                            key={idx} 
                            className="px-4 py-3 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer flex gap-4 items-center transition-colors border-b last:border-b-0"
                            onClick={() => {
                              const tag = c.club_tag.startsWith("#") ? c.club_tag : `#${c.club_tag}`
                              setShowClubSuggestions(false)
                              setClubSuggestions([])
                              setClubInput(tag)
                              handleSyncClub(tag)
                            }}
                          >
                            <Avatar className="w-10 h-10 border-2 border-primary/20 shrink-0 shadow-sm bg-primary/10">
                              <AvatarImage src={`https://cdn.brawlify.com/club-badges/regular/${c.badge_id || 16000000}.png`} />
                              <AvatarFallback className="bg-primary/10"><Building2 className="w-5 h-5 text-primary" /></AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col gap-1 w-full overflow-hidden">
                              <div className="flex items-center gap-2">
                                <span className="font-bold truncate text-base">{c.name}</span>
                                <Badge variant="secondary" className="text-[10px] font-mono bg-primary/10 text-primary border-primary/20 shrink-0">#{c.club_tag.replace(/^#+/, "")}</Badge>
                              </div>
                              <div className="flex items-center gap-3 text-xs font-medium text-muted-foreground">
                                <span className="flex items-center gap-1 text-yellow-600 dark:text-yellow-500 font-bold">
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
        </CardContent>
      </Card>

      {errorMsg && (
        <div className="p-4 rounded-md bg-destructive/15 text-destructive font-medium border border-destructive/20 animate-in fade-in zoom-in duration-300">
          {errorMsg}
        </div>
      )}

      {/* クラブ詳細表示カード */}
      {clubData && !errorMsg && (
        <Card className="border-t-4 border-t-purple-500 shadow-md mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <CardHeader className="pb-6">
            <div className="flex flex-col md:flex-row items-center md:items-start gap-6 text-center md:text-left">
              <Avatar className="w-20 h-20 md:w-24 md:h-24 border-4 border-background shadow-xl bg-purple-500/10">
                <AvatarImage src={`https://cdn.brawlify.com/club-badges/regular/${clubData.badge_id || 16000000}.png`} />
                <AvatarFallback className="bg-purple-500/20 text-purple-600 text-2xl font-bold"><Building2 className="w-10 h-10" /></AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center justify-center md:justify-start gap-3">
                  <CardTitle className="text-3xl font-extrabold tracking-tight">{clubData.name}</CardTitle>
                  <Badge variant="outline" className="font-mono text-xs">#{clubData.club_tag}</Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-2 max-w-xl">{clubData.description || "説明なし"}</p>
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto mt-4 md:mt-0">
                <div className="text-center md:text-right bg-yellow-500/10 px-5 py-3 rounded-xl w-full sm:w-auto border border-yellow-500/20">
                  <div className="text-sm font-semibold text-yellow-600 dark:text-yellow-400 flex items-center justify-center md:justify-end gap-1">
                    <Trophy className="w-4 h-4 text-yellow-500" /> 総トロフィー
                  </div>
                  <div className="text-2xl font-black text-yellow-600 dark:text-yellow-400 mt-1">{clubData.trophies?.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">必要: {clubData.required_trophies?.toLocaleString()} 🏆</div>
                </div>
                <div className="text-center md:text-right bg-primary/5 px-5 py-3 rounded-xl w-full sm:w-auto border border-primary/10">
                  <div className="text-sm font-semibold text-muted-foreground flex items-center justify-center md:justify-end gap-1">
                    <Users className="w-4 h-4 text-primary" /> メンバー数
                  </div>
                  <div className="text-2xl font-black text-primary mt-1">{clubData.members?.length || 0} / 30</div>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="border-t pt-6">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-foreground/90">
              <Users className="w-5 h-5 text-primary" /> 所属メンバー一覧
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {clubData.members && clubData.members.length > 0 ? (
                clubData.members.map((m: any, idx: number) => (
                  <div
                    key={idx}
                    onClick={() => {
                      setSearchMode("player")
                      setPlayerTag(m.tag)
                      handleSync(m.tag)
                    }}
                    className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30 hover:bg-primary/10 border border-transparent hover:border-primary/20 transition-all cursor-pointer group shadow-sm"
                  >
                    <Avatar className="w-10 h-10 border border-primary/20 shrink-0 group-hover:scale-105 transition-transform">
                      <AvatarImage src={`https://cdn.brawlify.com/profile-icons/regular/${m.icon?.id || m.icon_id || 28000000}.png`} />
                      <AvatarFallback className="bg-primary/10 font-bold"><User className="w-5 h-5 text-primary/70" /></AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col overflow-hidden">
                      <span className="font-bold text-sm truncate group-hover:text-primary transition-colors" title={m.name}>{m.name}</span>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="capitalize text-[11px] font-semibold px-1.5 py-0.2 rounded bg-background border">{m.role || "member"}</span>
                        <span className="font-mono text-yellow-600 dark:text-yellow-500 font-bold">{m.trophies?.toLocaleString()} 🏆</span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="col-span-full py-8 text-center text-muted-foreground">メンバー情報が見つかりませんでした。</div>
              )}
            </div>
          </CardContent>
        </Card>
      )}


      {data && !errorMsg && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 mt-8">
          {data.profile && (
            /* Profile Card */
            <Card className="border-t-4 border-t-blue-500 shadow-md mb-8">
              <CardHeader className="pb-8">
                <div className="flex flex-col md:flex-row items-center md:items-start gap-6 text-center md:text-left">
                  <Avatar className="w-20 h-20 md:w-24 md:h-24 border-4 border-background shadow-xl">
                    <AvatarImage src={`https://cdn.brawlify.com/profile-icons/regular/${data.profile?.icon_id || 28000000}.png`} />
                    <AvatarFallback className="bg-primary/10 text-2xl font-bold"><User className="w-10 h-10 text-primary/70" /></AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <CardTitle className="text-3xl font-extrabold tracking-tight">{data.profile?.name}</CardTitle>
                    <div className="flex flex-wrap justify-center md:justify-start items-center gap-2 mt-2 text-muted-foreground">
                      <span className="font-medium">{data.player_tag}</span>
                      <span 
                        className={`text-xs px-2.5 py-1 rounded-full font-semibold transition-all flex items-center gap-1.5 ${
                          data.profile?.club_name && data.profile.club_name !== "No Club"
                            ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 cursor-pointer shadow-sm"
                            : "bg-secondary text-secondary-foreground"
                        }`}
                        onClick={() => {
                          if (data.profile?.club_name && data.profile.club_name !== "No Club") {
                            const tagOrName = data.profile.club_tag || data.profile.club_name;
                            setSearchMode("club");
                            setClubInput(tagOrName);
                            handleSyncClub(tagOrName);
                          }
                        }}
                        title={data.profile?.club_name !== "No Club" ? "クリックしてクラブ詳細を表示" : ""}
                      >
                        <Building2 className="w-3.5 h-3.5" />
                        {data.profile?.club_name || "No Club"}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto mt-4 md:mt-0">
                <div className="text-center md:text-right bg-primary/5 px-4 py-3 rounded-xl w-full sm:w-auto">
                  <div className="text-sm font-semibold text-muted-foreground flex items-center justify-center md:justify-end gap-1">
                    <Trophy className="w-4 h-4 text-yellow-500" /> トロフィー
                  </div>
                  <div className="text-2xl font-black text-primary mt-1">{data.profile?.trophies != null ? data.profile.trophies.toLocaleString() : 0}</div>
                  <div className="text-xs text-muted-foreground">最高: {data.profile?.highest_trophies != null ? data.profile.highest_trophies.toLocaleString() : 0}</div>
                </div>
                {data.profile?.ranked_elo ? (
                  <div className="flex items-center justify-center w-full sm:w-auto gap-3">
                    {data.profile.ranked_rank > 0 && (() => {
                      const rankInfo = getRankImage(data.profile.ranked_rank);
                      if (!rankInfo) return null;
                      return (
                        <div className="relative w-14 h-14 md:w-16 md:h-16 drop-shadow-md flex items-center justify-center transform hover:scale-105 transition-transform">
                          <img 
                            src={rankInfo.url} 
                            alt={rankInfo.name} 
                            className="w-full h-full object-contain" 
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                          {rankInfo.tier && (
                            <div className="absolute -bottom-1 -right-1 bg-slate-900/90 backdrop-blur-md px-1.5 py-0.5 rounded text-[11px] font-black text-white border border-white/20 shadow-md leading-none">
                              {rankInfo.tier}
                            </div>
                          )}
                        </div>
                      )
                    })()}
                    <div className="flex-1 text-center md:text-right bg-purple-500/5 px-4 py-3 rounded-xl border border-purple-500/10">
                      <div className="text-sm font-semibold text-purple-600 dark:text-purple-400 flex items-center justify-center md:justify-end gap-1">
                        <Swords className="w-4 h-4" /> 現在スコア
                      </div>
                      <div className="text-2xl font-black text-purple-600 dark:text-purple-400 mt-1">{data.profile.ranked_elo != null ? data.profile.ranked_elo.toLocaleString() : 0}</div>
                      <div className="text-xs text-purple-500/70">最高: {data.profile.highest_ranked_elo != null ? data.profile.highest_ranked_elo.toLocaleString() : 0}</div>
                    </div>
                  </div>
                ) : null}
              </div>
                </div>
              </CardHeader>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Card className="bg-card/80 backdrop-blur-sm shadow-[0_0_15px_rgba(var(--primary),0.1)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                メタ・ギャップ分析
              </CardTitle>
              <CardDescription>世間の勝率とあなたの勝率の差（マップ総合）</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {data.insights?.gap_analysis?.map((item: any) => {
                const bInfo = getBrawlerInfo(item.char);
                return (
                <div key={item.char} className="space-y-2">
                  <div className="flex justify-between items-center text-sm font-medium">
                    <div className="flex items-center gap-2">
                      <Avatar className="w-8 h-8 border border-primary/20 shadow-sm">
                        <AvatarImage src={bInfo.imageUrl} />
                        <AvatarFallback className="bg-primary/10"><User className="w-4 h-4 text-primary/70" /></AvatarFallback>
                      </Avatar>
                      <span className="capitalize text-lg">{bInfo.nameJa}</span>
                    </div>
                    <span className={item.personal_win_rate >= item.global_win_rate ? "text-green-500" : "text-destructive"}>
                      {item.personal_win_rate}% (全体: {item.global_win_rate}%)
                    </span>
                  </div>
                  <div className="relative h-3 w-full bg-secondary rounded-full overflow-hidden shadow-inner">
                    <div 
                      className="absolute top-0 left-0 h-full bg-primary/30" 
                      style={{ width: `${item.global_win_rate}%` }} 
                    />
                    <div 
                      className={`absolute top-0 left-0 h-full ${item.personal_win_rate >= item.global_win_rate ? 'bg-green-500' : 'bg-destructive'}`}
                      style={{ width: `${item.personal_win_rate}%` }} 
                    />
                  </div>
                </div>
              )})}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="bg-gradient-to-br from-card to-background border-primary/30 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-primary">
                  <Lightbulb className="w-5 h-5 text-yellow-500" />
                  隠れ武器
                </CardTitle>
                <CardDescription>世間的にはマイナーだが、あなたは勝てているキャラ</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  {data.insights?.hidden_weapons.map((char: string) => {
                    const bInfo = getBrawlerInfo(char);
                    return (
                    <Badge key={char} variant="default" className="text-sm px-3 py-1.5 capitalize bg-gradient-to-r from-primary to-accent border-none text-white shadow-md flex items-center gap-2">
                      <Avatar className="w-5 h-5 border border-white/30">
                        <AvatarImage src={bInfo.imageUrl} />
                        <AvatarFallback className="bg-white/20"><User className="w-3 h-3 text-white" /></AvatarFallback>
                      </Avatar>
                      {bInfo.nameJa}
                    </Badge>
                  )})}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-card to-background border-destructive/30 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="w-5 h-5" />
                  要練習
                </CardTitle>
                <CardDescription>世間的には強いが、あなたが勝てていないキャラ</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  {data.insights?.needs_practice.map((char: string) => {
                    const bInfo = getBrawlerInfo(char);
                    return (
                    <Badge key={char} variant="destructive" className="text-sm px-3 py-1.5 capitalize shadow-md flex items-center gap-2">
                      <Avatar className="w-5 h-5 border border-white/30">
                        <AvatarImage src={bInfo.imageUrl} />
                        <AvatarFallback className="bg-white/20"><User className="w-3 h-3 text-white" /></AvatarFallback>
                      </Avatar>
                      {bInfo.nameJa}
                    </Badge>
                  )})}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* タブセクション（バトル履歴、分析、キャラクター） */}
          <Tabs defaultValue="battles" className="w-full mt-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <TabsList className="grid w-full grid-cols-3 mb-6 bg-secondary/50 p-1">
            <TabsTrigger value="battles" className="rounded-md font-semibold text-md">バトル履歴</TabsTrigger>
            <TabsTrigger value="analysis" className="rounded-md font-semibold text-md">モード別分析</TabsTrigger>
            <TabsTrigger value="characters" className="rounded-md font-semibold text-md">キャラクター</TabsTrigger>
          </TabsList>

          <TabsContent value="analysis" className="space-y-6">
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2 text-primary/80">
              📊 モード別分析
            </h2>
            {data.insights?.mode_analysis && data.insights.mode_analysis.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {data.insights.mode_analysis.map((modeStat) => (
                  <Card key={modeStat.mode} className="bg-card/40 backdrop-blur-md border-primary/20 shadow-xl overflow-hidden hover:shadow-2xl transition-all">
                    <div className="p-4 bg-secondary/30 flex justify-between items-center border-b border-primary/10">
                      <h3 className="font-bold text-lg">{translateMode(modeStat.mode)}</h3>
                      <Badge variant="outline" className="font-mono">{modeStat.matches} 試合</Badge>
                    </div>
                    <CardContent className="p-5 space-y-6">
                      <div className="space-y-2">
                        <div className="flex justify-between items-end">
                          <span className="text-sm font-medium text-muted-foreground">勝率</span>
                          <span className={`text-2xl font-black ${modeStat.win_rate >= 60 ? 'text-green-500' : modeStat.win_rate >= 50 ? 'text-blue-500' : 'text-orange-500'}`}>
                            {modeStat.win_rate}%
                          </span>
                        </div>
                        <div className="h-3 w-full bg-secondary/50 rounded-full overflow-hidden shadow-inner">
                          <div 
                            className={`h-full rounded-full transition-all duration-1000 ${modeStat.win_rate >= 60 ? 'bg-gradient-to-r from-green-500 to-emerald-400' : modeStat.win_rate >= 50 ? 'bg-gradient-to-r from-blue-500 to-cyan-400' : 'bg-gradient-to-r from-orange-500 to-red-400'}`}
                            style={{ width: `${modeStat.win_rate}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground font-mono">
                          <span>{modeStat.wins} 勝</span>
                          <span>{modeStat.matches - modeStat.wins} 敗</span>
                        </div>
                      </div>

                      {modeStat.star_player_count > 0 && (
                        <div className="flex items-center gap-2 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 p-2 rounded-lg border border-yellow-500/20">
                          <Star className="w-4 h-4 fill-current" />
                          <span className="text-sm font-semibold">MVP獲得: {modeStat.star_player_count}回</span>
                        </div>
                      )}

                      <div className="space-y-3">
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">よく使うキャラクター</span>
                        <div className="flex gap-3">
                          {modeStat.top_brawlers.map(brawlerName => {
                            const bInfo = getBrawlerInfo(brawlerName);
                            return (
                              <div key={brawlerName} className="flex flex-col items-center gap-1 group">
                                <Avatar className="w-12 h-12 border-2 border-primary/20 shadow-sm group-hover:scale-110 transition-transform">
                                  <AvatarImage src={bInfo.imageUrl} />
                                  <AvatarFallback className="bg-primary/10"><User className="w-5 h-5 text-primary/70" /></AvatarFallback>
                                </Avatar>
                                <span className="text-[10px] font-medium text-muted-foreground truncate w-14 text-center">
                                  {bInfo.nameJa}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground bg-secondary/20 rounded-xl border border-dashed">
                分析データがありません。
              </div>
            )}
          </TabsContent>

          <TabsContent value="battles" className="space-y-6">
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2 text-primary/80">
              ⚔️ 直近のバトル履歴
            </h2>
            {data.recent_battles && data.recent_battles.length > 0 ? (
            <Tabs defaultValue="all" value={battleTab} onValueChange={setBattleTab} className="w-full">
              <TabsList className="mb-4 bg-background/40">
                <TabsTrigger value="all">すべて</TabsTrigger>
                <TabsTrigger value="normal">通常マッチ</TabsTrigger>
                <TabsTrigger value="ranked">ガチバトル</TabsTrigger>
                <TabsTrigger value="friendly">フレンドバトル</TabsTrigger>
              </TabsList>
            <Card className="bg-card/40 backdrop-blur-md border-primary/20 shadow-xl overflow-hidden p-2">
              <TabsContent value={battleTab} className="mt-0 outline-none">
              <ScrollArea className="h-[600px] pr-4">
                <div className="space-y-3">
                  {data.recent_battles && (() => {
                    const filteredBattles = data.recent_battles.filter((b: any) => {
                      if (battleTab === "all") return true;
                      if (battleTab === "ranked") return b.type === "soloRanked" || b.type === "teamRanked";
                      if (battleTab === "friendly") return b.type === "friendly";
                      if (battleTab === "normal") return b.type === "ranked" || (b.type !== "friendly" && b.type !== "soloRanked" && b.type !== "teamRanked");
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
                      } else {
                        scoreDisplay = (
                          <p className={`font-bold text-xl drop-shadow-sm ${battle.trophy_change > 0 ? 'text-green-500' : battle.trophy_change < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                            {battle.trophy_change > 0 ? '+' : ''}{battle.trophy_change} 🏆
                          </p>
                        );
                      }

                      return (
                        <Card key={i} className="bg-card border border-primary/10 overflow-hidden hover:bg-primary/5 transition-colors">
                      {/* Header section */}
                       <div className="p-3 border-b border-primary/10 flex justify-between items-center bg-secondary/30">
                         <div className="flex items-center gap-3">
                           <div className={`w-1.5 h-11 rounded-full ${battle.result === 'victory' ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : battle.result === 'defeat' ? 'bg-destructive shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]'}`} />
                           <div>
                             <div className="flex items-center gap-2 mb-1">
                               <Badge variant={battle.result === 'victory' ? 'default' : battle.result === 'defeat' ? 'destructive' : 'outline'} className="uppercase text-[10px] px-2 font-bold tracking-wider">
                                 {battle.result === 'victory' ? '勝利' : battle.result === 'defeat' ? '敗北' : '引き分け'}
                               </Badge>
                               <span className="text-[10px] text-muted-foreground/60 font-medium tracking-wide">{formatBattleTime(battle.time)}</span>
                             </div>
                             <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                               <img src={getModeIconUrl(battle.mode)} alt={battle.mode} className="w-4 h-4 object-contain drop-shadow-md" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                               <span className="font-medium text-foreground/80">{translateMode(battle.mode)}</span>
                               <span className="opacity-40">|</span>
                               <span>{translateMap(battle.map)}</span>
                             </div>
                           </div>
                        </div>
                        <div className="text-right flex items-center gap-4">
                          <Avatar className="w-12 h-12 border-2 border-primary/30 shadow-[0_0_15px_rgba(var(--primary),0.2)]">
                            <AvatarImage src={mainBInfo.imageUrl} />
                            <AvatarFallback className="bg-primary/10"><User className="w-5 h-5 text-primary/70" /></AvatarFallback>
                          </Avatar>
                          <div className="w-20 text-right flex justify-end">
                            {scoreDisplay}
                          </div>
                        </div>
                      </div>
                      
                      {/* Teams section */}
                      <div className="p-3 grid grid-cols-2 gap-4 bg-secondary/10">
                        {/* My Team */}
                        <div className="space-y-3 relative">
                          <p className="text-xs font-bold text-primary tracking-widest border-b border-primary/20 pb-1.5 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                            味方チーム
                          </p>
                          <div className="flex flex-col gap-2.5">
                            {battle.my_team && battle.my_team.map((p: any, idx: number) => {
                              const bInfo = getBrawlerInfo(p.brawler);
                              const isMe = (p.brawler || "").toLowerCase() === (battle.hero || "").toLowerCase();
                              return (
                                <div 
                                  key={idx} 
                                  onClick={() => handleSync(p.tag)}
                                  className={`flex items-center gap-3 p-1.5 rounded-xl transition-colors group cursor-pointer ${isMe ? 'bg-primary/10 border border-primary/20' : 'hover:bg-white/5 border border-transparent'}`}
                                >
                                  <Avatar className={`w-10 h-10 shadow-sm transition-transform group-hover:scale-105 ${isMe ? 'border border-primary ring-2 ring-primary/30 ring-offset-1 ring-offset-background' : 'border border-primary/20'}`}>
                                    <AvatarImage src={bInfo.imageUrl} />
                                    <AvatarFallback className="bg-primary/10"><User className="w-5 h-5 text-primary/70" /></AvatarFallback>
                                  </Avatar>
                                  <div className="flex flex-col overflow-hidden">
                                    <span className={`text-sm truncate max-w-[120px] font-bold tracking-wide ${isMe ? 'text-primary' : 'text-foreground/90'}`} title={p.name}>
                                      {p.name}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground/40 group-hover:text-muted-foreground/80 transition-colors font-medium tracking-wider">{bInfo.nameJa}</span>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                        {/* Opponent Teams */}
                        <div className="space-y-3 border-l border-primary/10 pl-4 relative">
                          <p className="text-xs font-bold text-destructive tracking-widest border-b border-destructive/20 pb-1.5 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-destructive" />
                            相手チーム
                          </p>
                          <div className="flex flex-col gap-2.5">
                            {battle.opponent_teams && battle.opponent_teams.map((team: any, t_idx: number) => (
                              <div key={t_idx} className="space-y-2.5">
                                {Array.isArray(team) && team.map((p: any, idx: number) => {
                                  const bInfo = getBrawlerInfo(p.brawler);
                                  return (
                                    <div 
                                      key={`${t_idx}-${idx}`} 
                                      onClick={() => handleSync(p.tag)}
                                      className="flex items-center gap-3 p-1.5 rounded-xl hover:bg-white/5 transition-colors group cursor-pointer border border-transparent"
                                    >
                                      <Avatar className="w-10 h-10 border border-destructive/30 shadow-sm transition-transform group-hover:scale-105">
                                        <AvatarImage src={bInfo.imageUrl} />
                                        <AvatarFallback className="bg-destructive/10"><User className="w-4 h-4 text-destructive/70" /></AvatarFallback>
                                      </Avatar>
                                      <div className="flex flex-col overflow-hidden">
                                        <span className="text-sm truncate max-w-[120px] font-bold tracking-wide text-foreground/90" title={p.name}>{p.name}</span>
                                        <span className="text-[10px] text-muted-foreground/40 group-hover:text-muted-foreground/80 transition-colors font-medium tracking-wider">{bInfo.nameJa}</span>
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
                バトル履歴がありません。
              </div>
            )}
          </TabsContent>
          <TabsContent value="characters" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.isArray(data.brawlers) && [...data.brawlers].sort((a, b) => (b.trophies || 0) - (a.trophies || 0)).map((brawler, idx) => {
                const maxPower = 11;
                const power = brawler.power || 1;
                const powerRatio = (power / maxPower) * 100;
                const gadgets = Array.isArray(brawler.gadgets) ? brawler.gadgets : [];
                const starPowers = Array.isArray(brawler.starPowers) ? brawler.starPowers : [];
                const gears = Array.isArray(brawler.gears) ? brawler.gears : [];
                const hyperCharges = Array.isArray(brawler.hyperCharges) ? brawler.hyperCharges : [];
                
                return (
                  <Card key={idx} className="overflow-hidden hover:border-primary/50 transition-colors bg-gradient-to-br from-card to-card/50">
                    <div className="p-3 pb-2 flex gap-3 items-center border-b border-border/50">
                      <div className="relative">
                        <img 
                          src={`https://cdn.brawlify.com/brawlers/borders/${brawler.id}.png`} 
                          alt={brawler.name} 
                          className="w-12 h-12 rounded-lg border-2 border-background shadow-sm bg-secondary/30 object-cover"
                          onError={(e) => { e.currentTarget.src = 'https://cdn.brawlify.com/brawler/shelly.png'; }}
                        />
                        <div className="absolute -bottom-1 -right-1 bg-yellow-500 text-black text-[9px] font-black w-5 h-5 rounded-sm flex items-center justify-center border border-black shadow-sm">
                          {power}
                        </div>
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <h4 className="font-extrabold text-lg truncate tracking-tight">{brawler.name}</h4>
                        <div className="flex items-center gap-1.5 mt-0.5 text-xs font-semibold text-muted-foreground">
                          <Trophy className="w-3.5 h-3.5 text-yellow-500" />
                          <span className="text-yellow-600 dark:text-yellow-400">{brawler.trophies || 0}</span>
                          <span className="opacity-50">/</span>
                          <span>{brawler.highestTrophies || brawler.trophies || 0}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="px-3 py-2.5 bg-secondary/10 flex flex-col gap-2">
                      <div className="flex items-center justify-between text-xs font-medium">
                        <span className="text-muted-foreground">パワーレベル</span>
                        <span className={power === 11 ? "text-green-500 font-bold" : ""}>{power} / {maxPower}</span>
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
                              <div key={h.id} className="w-6 h-6 rounded border border-purple-500/50 bg-gradient-to-tr from-purple-600 to-fuchsia-500 flex items-center justify-center shadow-sm">
                                <span className="text-[8px] font-black text-white">HC</span>
                              </div>
                            )) : <span className="text-muted-foreground text-[10px]">-</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
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
    </div>
  )
}
