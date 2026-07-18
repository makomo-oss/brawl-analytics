"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Trophy, Swords, Map, Info, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { getBrawlerInfo } from "@/lib/brawlers"

const tierConfig = {
  S: { color: "from-pink-500 to-rose-500", label: "環境トップ", bg: "bg-pink-500/10 border-pink-500/30" },
  A: { color: "from-orange-500 to-amber-500", label: "優秀な選択肢", bg: "bg-orange-500/10 border-orange-500/30" },
  B: { color: "from-yellow-500 to-lime-500", label: "平均的", bg: "bg-yellow-500/10 border-yellow-500/30" },
  C: { color: "from-blue-500 to-cyan-500", label: "状況を選ぶ", bg: "bg-blue-500/10 border-blue-500/30" },
  D: { color: "from-slate-500 to-gray-500", label: "現環境では厳しい", bg: "bg-slate-500/10 border-slate-500/30" }
}

export default function TierListPage() {
  const [tierData, setTierData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [selectedChar, setSelectedChar] = useState<any>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  useEffect(() => {
    const fetchTierList = async () => {
      try {
        const res = await fetch("http://localhost:8000/meta/tier-list")
        const data = await res.json()
        setTierData(data)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    fetchTierList()
  }, [])

  const fetchCharacterDetail = async (charName: string) => {
    try {
      const res = await fetch(`http://localhost:8000/meta/characters/${charName}`)
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
        <p className="text-muted-foreground text-lg flex items-center gap-2">
          上位プレイヤーの最新バトルログ（{tierData?.metrics?.analyzed_matches ? tierData.metrics.analyzed_matches.toLocaleString() : '---'} 試合）から完全データ駆動で算出した最強ランキング。
        </p>
      </div>

      <Tabs defaultValue="global" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 lg:w-[400px] bg-secondary/50 p-1">
          <TabsTrigger value="global" className="font-bold">
            <Trophy className="w-4 h-4 mr-2" />
            グローバルTier
          </TabsTrigger>
          <TabsTrigger value="map" className="font-bold">
            <Map className="w-4 h-4 mr-2" />
            マップ別
          </TabsTrigger>
        </TabsList>

        <TabsContent value="global" className="space-y-6">
          {loading ? (
            <div className="h-64 flex items-center justify-center border rounded-xl bg-card/50 backdrop-blur-sm">
              <span className="text-primary font-medium animate-pulse flex items-center gap-2">
                <Swords className="w-5 h-5 animate-spin" /> データ集計中...
              </span>
            </div>
          ) : (
            <div className="grid gap-6">
              {['S', 'A', 'B', 'C', 'D'].map((tierKey) => {
                const config = tierConfig[tierKey as keyof typeof tierConfig];
                const chars = tierData?.tiers?.[tierKey] || [];
                
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
                      <CardContent className="flex-1 p-4 md:p-6 flex flex-wrap gap-3">
                        {chars.map((char: string) => {
                          const info = getBrawlerInfo(char);
                          return (
                            <div 
                              key={char} 
                              onClick={() => fetchCharacterDetail(char)}
                              className="group relative flex flex-col items-center justify-center p-2 w-20 h-24 rounded-xl bg-background/60 hover:bg-background/90 border border-primary/10 hover:border-primary/50 transition-all hover:-translate-y-1 cursor-pointer shadow-sm"
                            >
                              <Avatar className="w-12 h-12 border-2 border-transparent group-hover:border-primary/50 transition-colors shadow-sm">
                                <AvatarImage src={info.imageUrl} />
                                <AvatarFallback className="bg-primary/10 text-primary font-bold">{info.nameJa.charAt(0)}</AvatarFallback>
                              </Avatar>
                              <span className="mt-2 font-bold text-[10px] truncate w-full text-center text-foreground/80 group-hover:text-primary transition-colors">{info.nameJa}</span>
                            </div>
                          )
                        })}
                      </CardContent>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>
        <TabsContent value="map">
          <Card className="bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle>マップ別分析</CardTitle>
              <CardDescription>特定のマップに絞った勝率データ（順次実装予定）</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-48 border-dashed border-2 rounded-xl flex items-center justify-center text-muted-foreground bg-secondary/10">
                <Swords className="w-8 h-8 opacity-50 mr-2" />
                <span>データ集計中...</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* キャラクター詳細モーダル (Sheet) */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto bg-card/95 backdrop-blur-xl border-l-primary/20">
          {selectedChar && (
            <div className="space-y-6 pb-8">
              <SheetHeader className="text-left">
                <div className="flex items-center gap-4 mb-2">
                  <Avatar className="w-20 h-20 border-4 shadow-xl ring-2 ring-primary/20 ring-offset-2 ring-offset-background">
                    <AvatarImage src={getBrawlerInfo(selectedChar.character_id).imageUrl} />
                    <AvatarFallback>{selectedChar.character_id.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div>
                    <SheetTitle className="text-3xl font-black capitalize">{getBrawlerInfo(selectedChar.character_id).nameJa}</SheetTitle>
                    <SheetDescription className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className={`font-black text-sm bg-gradient-to-r ${tierConfig[selectedChar.tier as keyof typeof tierConfig]?.color || 'from-gray-500 to-gray-600'} text-white border-none`}>
                        環境Tier {selectedChar.tier}
                      </Badge>
                      <span className="text-xs font-mono text-muted-foreground">スコア: {selectedChar.score}</span>
                    </SheetDescription>
                  </div>
                </div>
              </SheetHeader>

              <div className="grid grid-cols-2 gap-4">
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
              </div>

              <div className="space-y-6 mt-8">
                {/* カモ (有利対面) */}
                <div className="space-y-3 relative p-4 rounded-xl bg-green-500/5 border border-green-500/20">
                  <h3 className="font-extrabold text-sm flex items-center gap-2 text-green-600 dark:text-green-400">
                    <TrendingUp className="w-5 h-5" /> カモ (有利な対面) TOP5
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

                {/* 天敵 (不利対面) */}
                <div className="space-y-3 relative p-4 rounded-xl bg-red-500/5 border border-red-500/20">
                  <h3 className="font-extrabold text-sm flex items-center gap-2 text-red-600 dark:text-red-400">
                    <TrendingDown className="w-5 h-5" /> 天敵 (不利な対面) TOP5
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
