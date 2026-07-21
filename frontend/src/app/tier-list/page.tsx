"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Trophy, Swords, Info, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getBrawlerInfo, BRAWLER_MAP } from "@/lib/brawlers"
import { translateMode, translateMap } from "@/lib/translations"
import { API_URL } from "@/lib/config"

const tierConfig = {
  S: { color: "from-pink-500 to-rose-500", label: "環境トップ", bg: "bg-pink-500/10 border-pink-500/30" },
  A: { color: "from-orange-500 to-amber-500", label: "優秀な選択肢", bg: "bg-orange-500/10 border-orange-500/30" },
  B: { color: "from-yellow-500 to-lime-500", label: "平均的", bg: "bg-yellow-500/10 border-yellow-500/30" },
  C: { color: "from-blue-500 to-cyan-500", label: "状況を選ぶ", bg: "bg-blue-500/10 border-blue-500/30" },
  D: { color: "from-slate-500 to-gray-500", label: "現環境では厳しい", bg: "bg-slate-500/10 border-slate-500/30" },
  "N/A": { color: "from-zinc-500 to-stone-500", label: "データ不足", bg: "bg-zinc-500/10 border-zinc-500/30 border-dashed" }
}

export default function TierListPage() {
  const [tierData, setTierData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [selectedChar, setSelectedChar] = useState<any>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  
  const [selectedType, setSelectedType] = useState("global")
  const [subType, setSubType] = useState("all") // all, mode, map
  const [selectedId, setSelectedId] = useState("")
  const [categories, setCategories] = useState({ modes: [], maps: [] })

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await fetch(`${API_URL}/meta/categories`)
        if (res.ok) {
          const data = await res.json()
          setCategories(data)
        }
      } catch (err) {
        console.error(err)
      }
    }
    fetchCategories()
  }, [])

  // 選択に応じたTierデータの取得
  useEffect(() => {
    const fetchTierList = async () => {
      setLoading(true)
      try {
        let url = `${API_URL}/meta/tier-list?type=${selectedType}`
        if (selectedType === "gachi" && subType !== "all" && selectedId) {
          url += `&sub_type=${subType}&id=${encodeURIComponent(selectedId)}`
        }

        // gachiでmode/mapが選ばれているのにidがない場合はフェッチ待機
        if (selectedType === "gachi" && subType !== "all" && !selectedId) {
          setLoading(false)
          return
        }

        const res = await fetch(url)
        if (res.ok) {
          const data = await res.json()
          setTierData(data)
        } else {
          setTierData(null) // Not found
        }
      } catch (err) {
        console.error(err)
        setTierData(null)
      } finally {
        setLoading(false)
      }
    }
    fetchTierList()
  }, [selectedType, subType, selectedId])

  const handleTypeChange = (value: string) => {
    setSelectedType(value)
  }

  const handleSubTypeChange = (value: string) => {
    setSubType(value)
    if (value === "mode" && categories.modes.length > 0) setSelectedId(categories.modes[0])
    else if (value === "map" && categories.maps.length > 0) setSelectedId(categories.maps[0])
    else setSelectedId("")
  }

  const fetchCharacterDetail = async (charName: string) => {
    try {
      let url = `${API_URL}/meta/characters/${charName}?type=${selectedType}`
      if (selectedType === "gachi" && subType !== "all" && selectedId) {
        url += `&sub_type=${subType}&id=${encodeURIComponent(selectedId)}`
      }
      const res = await fetch(url)
      const data = await res.json()
      setSelectedChar(data)
      setSheetOpen(true)
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-7xl mx-auto">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent flex items-center gap-3">
          <Trophy className="w-8 h-8 text-yellow-500" />
          環境分析 (Tier表)
        </h1>
        {!loading && (
          tierData?.metrics?.analyzed_matches > 0 ? (
            <p className="text-muted-foreground text-lg flex items-center gap-2">
              上位プレイヤーの最新バトルログ（{tierData.metrics.analyzed_matches.toLocaleString()} 試合）から完全データ駆動で算出した最強ランキング。
            </p>
          ) : (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 flex items-start gap-3 mt-2">
              <Info className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-yellow-700 dark:text-yellow-400">
                <strong>生データ0件 (ベースライン表示中):</strong> 現在有効なAPIキーが設定されていないため、バトルログの収集ができていません。代わりに2024年の一般的なTier環境（定石）を表示しています。生データに基づく完全自動算出を行うには <code>BRAWL_API_TOKEN</code> の設定が必要です。
              </p>
            </div>
          )
        )}
      </div>

      <Tabs value={selectedType} onValueChange={handleTypeChange} className="space-y-6">
        <div className="flex justify-center mb-8">
          <TabsList className="grid w-full max-w-[600px] grid-cols-2 bg-card/80 backdrop-blur-md border shadow-sm rounded-xl p-1.5 !h-[60px]">
            <TabsTrigger value="global" className="text-base sm:text-lg font-bold !h-full !py-0 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all rounded-lg">全体Tier</TabsTrigger>
            <TabsTrigger value="gachi" className="text-base sm:text-lg font-bold !h-full !py-0 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all rounded-lg flex items-center justify-center gap-2">
              <Trophy className="w-5 h-5" /> ガチバトルTier
            </TabsTrigger>
          </TabsList>
        </div>

        {selectedType === "gachi" && (
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-center bg-secondary/10 p-3 rounded-xl border border-primary/10 max-w-3xl mx-auto mb-6">
            <Tabs value={subType} onValueChange={handleSubTypeChange} className="w-full sm:w-auto">
              <TabsList className="grid grid-cols-3 w-full sm:w-[320px] !h-[48px] p-1.5 rounded-lg bg-background/50">
                <TabsTrigger value="all" className="text-sm font-semibold !h-full !py-0 rounded-md">すべて</TabsTrigger>
                <TabsTrigger value="mode" className="text-sm font-semibold !h-full !py-0 rounded-md">モード別</TabsTrigger>
                <TabsTrigger value="map" className="text-sm font-semibold !h-full !py-0 rounded-md">マップ別</TabsTrigger>
              </TabsList>
            </Tabs>

            {subType === "mode" && (
              <Select value={selectedId} onValueChange={(val) => setSelectedId(val || "")}>
                <SelectTrigger className="w-full sm:w-[220px] bg-background">
                  <SelectValue placeholder="モードを選択...">
                    {selectedId ? translateMode(selectedId) : "モードを選択..."}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {categories.modes.map((m: string) => (
                    <SelectItem key={m} value={m}>{translateMode(m)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {subType === "map" && (
              <Select value={selectedId} onValueChange={(val) => setSelectedId(val || "")}>
                <SelectTrigger className="w-full sm:w-[220px] bg-background">
                  <SelectValue placeholder="マップを選択...">
                    {selectedId ? translateMap(selectedId) : "マップを選択..."}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {categories.maps.map((m: string) => (
                    <SelectItem key={m} value={m}>{translateMap(m)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        <div className="space-y-6">
          {loading ? (
            <div className="h-64 flex items-center justify-center border rounded-xl bg-card/50 backdrop-blur-sm">
              <span className="text-primary font-medium animate-pulse flex items-center gap-2">
                <Swords className="w-5 h-5 animate-spin" /> データ集計中...
              </span>
            </div>
          ) : (
            <div className="grid gap-6">
              {tierData?.tiers && Object.values(tierData.tiers).every((arr: any) => arr.length === 0) ? (
                <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed rounded-xl bg-card/50">
                  <AlertTriangle className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
                  <h3 className="text-xl font-bold text-foreground">まだデータがありません</h3>
                  <p className="text-muted-foreground mt-2 max-w-md">
                    指定された条件（ガチバトル・モード・マップ等）の分析データがまだ十分に集まっていません。<br/>
                    今後のプレイヤーデータの集計をお待ちください。
                  </p>
                </div>
              ) : (
                ['S', 'A', 'B', 'C', 'D', 'N/A'].map((tierKey) => {
                  const config = tierConfig[tierKey as keyof typeof tierConfig];
                  let chars = tierData?.tiers?.[tierKey] || [];
                  
                  if (tierKey === 'N/A' && tierData?.tiers) {
                    const allDefined = Object.keys(BRAWLER_MAP);
                    const present = new Set(['S', 'A', 'B', 'C', 'D'].flatMap(k => tierData.tiers[k] || []));
                    chars = allDefined.filter(c => !present.has(c));
                  }
                  
                  if (chars.length === 0) return null;

                  return (
                  <Card key={tierKey} className={`overflow-hidden backdrop-blur-sm shadow-lg border ${config.bg} transition-all hover:shadow-xl`}>
                    <div className="flex flex-col md:flex-row">
                      {/* Tier Label Column */}
                      <div className={`md:w-32 flex flex-col items-center justify-center p-4 bg-gradient-to-br ${config.color} text-white shadow-inner`}>
                        <h2 className="text-5xl font-black drop-shadow-md">{tierKey}</h2>
                        <span className="text-xs font-bold mt-2 bg-black/20 px-2 py-1 rounded-full text-center">{config.label}</span>
                      </div>
                      
                      {/* Characters Area */}
                      <CardContent className="flex-1 p-4 md:p-6 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 sm:gap-4">
                        {chars.map((charId: string) => {
                          const info = getBrawlerInfo(charId);
                          return (
                            <div 
                              key={charId} 
                              onClick={() => fetchCharacterDetail(charId)}
                              className="group relative flex flex-col items-center justify-center p-2 rounded-xl bg-background/60 hover:bg-background/90 border border-primary/10 hover:border-primary/50 transition-all hover:-translate-y-1 cursor-pointer shadow-sm"
                            >
                              <div className="w-14 h-14 sm:w-16 sm:h-16 shrink-0 border-2 border-black/20 dark:border-white/10 group-hover:border-primary transition-colors shadow-sm rounded-md bg-primary/10 relative">
                                <div className="absolute inset-0 flex items-center justify-center z-0">
                                  <span className="text-primary font-bold">{info.nameJa.charAt(0)}</span>
                                </div>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={info.imageUrl} alt={info.nameJa} className="object-cover w-full h-full rounded-sm absolute inset-0 z-10" />
                              </div>
                              <span className="text-xs font-medium text-center truncate w-full px-1 mt-2">{info.nameJa}</span>
                            </div>
                          )
                        })}
                      </CardContent>
                    </div>
                  </Card>
                )
              })
              )}
            </div>
          )}
        </div>
      </Tabs>

      {/* キャラクター詳細モーダル (Sheet) */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto bg-card/95 backdrop-blur-xl border-l-primary/20">
          {selectedChar && (
            <div className="space-y-6 pb-8">
              <SheetHeader className="text-left">
                <div className="flex items-center gap-4 mb-2">
                  <div className="w-20 h-20 shrink-0 border-4 shadow-xl ring-2 ring-primary/20 ring-offset-2 ring-offset-background rounded-md bg-primary/10 relative">
                    <div className="absolute inset-0 flex items-center justify-center z-0">
                      <span className="text-primary font-bold text-2xl">{selectedChar.character_id.charAt(0).toUpperCase()}</span>
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={getBrawlerInfo(selectedChar.character_id).imageUrl} alt={selectedChar.character_id} className="object-cover w-full h-full rounded-sm absolute inset-0 z-10" />
                  </div>
                  <div>
                    <SheetTitle className="text-3xl font-black capitalize">{getBrawlerInfo(selectedChar.character_id).nameJa}</SheetTitle>
                    <SheetDescription className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className={`font-black text-sm bg-gradient-to-r ${tierConfig[selectedChar.tier as keyof typeof tierConfig]?.color || 'from-gray-500 to-gray-600'} text-white border-none`}>
                        環境Tier {selectedChar.tier}
                      </Badge>
                      <span className="text-xs font-mono text-muted-foreground">スコア: {selectedChar.score} / {selectedChar.total_matches}試合</span>
                    </SheetDescription>
                  </div>
                </div>
              </SheetHeader>

              <div className="grid grid-cols-3 gap-4">
                <Card className="bg-secondary/20 border-none shadow-inner">
                  <CardContent className="p-4 flex flex-col items-center justify-center">
                    <span className="text-xs font-bold text-muted-foreground mb-1">総合勝率</span>
                    <span className={`text-2xl font-black ${selectedChar.win_rate >= 55 ? 'text-green-500' : selectedChar.win_rate >= 50 ? 'text-blue-500' : 'text-orange-500'}`}>
                      {selectedChar.win_rate}%
                    </span>
                  </CardContent>
                </Card>
                <Card className="bg-secondary/20 border-none shadow-inner">
                  <CardContent className="p-4 flex flex-col items-center justify-center">
                    <span className="text-xs font-bold text-muted-foreground mb-1">使用率</span>
                    <span className="text-2xl font-black text-primary">
                      {selectedChar.use_rate}%
                    </span>
                  </CardContent>
                </Card>
                <Card className="bg-secondary/20 border-none shadow-inner">
                  <CardContent className="p-4 flex flex-col items-center justify-center">
                    <span className="text-[10px] font-bold text-muted-foreground mb-1 text-center leading-tight">分析<br/>試合数</span>
                    <span className="text-xl font-black text-foreground">
                      {selectedChar.total_matches}
                    </span>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-6 mt-8">
                {/* 有利な対面 */}
                <div className="space-y-3 relative p-4 rounded-xl bg-green-500/5 border border-green-500/20">
                  <h3 className="font-extrabold text-sm flex items-center gap-2 text-green-600 dark:text-green-400">
                    <TrendingUp className="w-5 h-5" /> 有利な対面 TOP5
                  </h3>
                  {selectedChar.kamo && selectedChar.kamo.length > 0 ? (
                    <div className="space-y-2">
                      {selectedChar.kamo.map((k: any, idx: number) => {
                        const info = getBrawlerInfo(k.brawler);
                        return (
                          <div key={idx} className="flex items-center justify-between p-2 rounded-lg hover:bg-green-500/10 transition-colors">
                            <div className="flex items-center gap-3">
                              <Avatar className="w-8 h-8 border border-green-500/30">
                                <AvatarImage src={info.imageUrl} />
                                <AvatarFallback>{info.nameJa.charAt(0)}</AvatarFallback>
                              </Avatar>
                              <span className="font-bold text-sm">{info.nameJa}</span>
                            </div>
                            <div className="text-right">
                              <span className="font-black text-green-500">{k.win_rate}%</span>
                              <div className="text-[10px] text-muted-foreground">{k.matches}戦</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground p-2">十分な対面データがありません。</p>
                  )}
                </div>

                {/* 不利な対面 */}
                <div className="space-y-3 relative p-4 rounded-xl bg-red-500/5 border border-red-500/20">
                  <h3 className="font-extrabold text-sm flex items-center gap-2 text-red-600 dark:text-red-400">
                    <TrendingDown className="w-5 h-5" /> 不利な対面 TOP5
                  </h3>
                  {selectedChar.tenteki && selectedChar.tenteki.length > 0 ? (
                    <div className="space-y-2">
                      {selectedChar.tenteki.map((t: any, idx: number) => {
                        const info = getBrawlerInfo(t.brawler);
                        return (
                          <div key={idx} className="flex items-center justify-between p-2 rounded-lg hover:bg-red-500/10 transition-colors">
                            <div className="flex items-center gap-3">
                              <Avatar className="w-8 h-8 border border-red-500/30">
                                <AvatarImage src={info.imageUrl} />
                                <AvatarFallback>{info.nameJa.charAt(0)}</AvatarFallback>
                              </Avatar>
                              <span className="font-bold text-sm">{info.nameJa}</span>
                            </div>
                            <div className="text-right">
                              <span className="font-black text-red-500">{t.win_rate}%</span>
                              <div className="text-[10px] text-muted-foreground">{t.matches}戦</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground p-2">十分な対面データがありません。</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
