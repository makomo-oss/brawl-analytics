"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ShieldAlert, Activity, Trophy } from "lucide-react"

export default function CompanionPage() {
  const [mapId, setMapId] = useState("")
  const [mode, setMode] = useState("")
  const [recommendations, setRecommendations] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const fetchRecommendations = async () => {
    setLoading(true)
    try {
      const res = await fetch("http://localhost:8000/match/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          map_id: mapId || "map_1",
          mode: mode || "bounty",
          allies: [],
          opponents: [],
          pick_turn: 1,
          is_proxy_pick: false
        })
      })
      const data = await res.json()
      setRecommendations(data.recommendations || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          リアルタイムBAN/Pick支援
        </h1>
        <p className="text-muted-foreground text-lg">
          マップと味方・敵のピック状況に応じた最適なキャラクターをAIが提案します。
        </p>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* 左側：入力パネル */}
        <Card className="lg:col-span-7 border-primary/10 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              設定・状況入力
            </CardTitle>
            <CardDescription>
              現在の試合状況をリアルタイムに入力してください。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">ゲームモード</label>
                <Select value={mode} onValueChange={setMode}>
                  <SelectTrigger>
                    <SelectValue placeholder="モードを選択" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bounty">賞金稼ぎ (Bounty)</SelectItem>
                    <SelectItem value="brawl_ball">ブロストライカー (Brawl Ball)</SelectItem>
                    <SelectItem value="gem_grab">エメラルドハント (Gem Grab)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">マップ</label>
                <Select value={mapId} onValueChange={setMapId}>
                  <SelectTrigger>
                    <SelectValue placeholder="マップを選択" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="map_1">シューティングスター</SelectItem>
                    <SelectItem value="map_2">中心街</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-secondary/30 border border-secondary">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">味方・敵の動的選択UIは順次追加予定です</span>
                <Button onClick={fetchRecommendations} disabled={loading} variant="default">
                  {loading ? "計算中..." : "おすすめを再計算"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 右側：推薦結果パネル */}
        <Card className="lg:col-span-5 border-primary/30 shadow-[0_0_20px_rgba(var(--primary),0.15)] bg-gradient-to-br from-card to-background">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <Trophy className="h-5 w-5" />
              おすすめキャラクター
            </CardTitle>
            <CardDescription>
              アルゴリズムによる最適解TOP3
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recommendations.length > 0 ? (
              <div className="space-y-4">
                {recommendations.map((rec, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 rounded-xl border bg-card/80 hover:bg-card hover:border-primary/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center font-bold text-xl text-primary">
                        {idx + 1}
                      </div>
                      <div>
                        <h3 className="font-bold text-lg capitalize">{rec.character_id}</h3>
                        <p className="text-sm text-muted-foreground">{rec.reason}</p>
                      </div>
                    </div>
                    <Badge variant="default" className="text-lg px-3 py-1">
                      {rec.score.toFixed(1)}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-48 flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed rounded-xl bg-card/30">
                <ShieldAlert className="h-8 w-8 mb-2 opacity-50" />
                <p>設定を入力して再計算してください</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
