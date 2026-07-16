"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Trophy, Swords, Map } from "lucide-react"

export default function TierListPage() {
  const [tierData, setTierData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

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

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          環境分析 (Tier表)
        </h1>
        <p className="text-muted-foreground text-lg">
          最新の勝率データと使用率に基づいた全キャラクターのTier表とメタレポートです。
        </p>
      </div>

      <Tabs defaultValue="global" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
          <TabsTrigger value="global">
            <Trophy className="w-4 h-4 mr-2" />
            グローバルTier
          </TabsTrigger>
          <TabsTrigger value="map">
            <Map className="w-4 h-4 mr-2" />
            マップ別
          </TabsTrigger>
        </TabsList>

        <TabsContent value="global" className="space-y-6">
          {loading ? (
            <div className="h-64 flex items-center justify-center border rounded-xl bg-card/50 backdrop-blur-sm">
              <span className="text-primary font-medium animate-pulse">読み込み中...</span>
            </div>
          ) : (
            <div className="grid gap-6">
              {/* Tier S */}
              <Card className="border-primary/30 shadow-[0_0_20px_rgba(var(--primary),0.1)] bg-card/80 backdrop-blur-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-2xl text-primary">
                    <Badge variant="default" className="text-xl px-4 py-1 bg-gradient-to-r from-primary to-accent border-none text-white shadow-lg shadow-primary/20">S Tier</Badge>
                    環境トップ
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-4 mt-4">
                    {tierData?.tier_S?.map((char: string) => (
                      <div key={char} className="flex flex-col items-center justify-center p-4 w-28 h-28 rounded-2xl bg-secondary/50 border border-primary/20 hover:border-primary transition-all hover:scale-105 cursor-pointer shadow-sm hover:shadow-[0_0_15px_rgba(var(--primary),0.3)]">
                        <div className="w-12 h-12 rounded-full bg-background/80 mb-3 flex items-center justify-center font-bold text-lg">{char.charAt(0).toUpperCase()}</div>
                        <span className="font-medium text-sm capitalize">{char}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Tier A */}
              <Card className="bg-card/60 backdrop-blur-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Badge variant="secondary" className="text-lg px-3 py-0.5">A Tier</Badge>
                    優秀な選択肢
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-4 mt-4">
                    {tierData?.tier_A?.map((char: string) => (
                      <div key={char} className="flex flex-col items-center justify-center p-4 w-24 h-24 rounded-xl bg-secondary/30 border hover:border-primary/50 transition-all cursor-pointer">
                        <div className="w-10 h-10 rounded-full bg-background/60 mb-2 flex items-center justify-center font-semibold">{char.charAt(0).toUpperCase()}</div>
                        <span className="font-medium text-xs capitalize">{char}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
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
    </div>
  )
}
