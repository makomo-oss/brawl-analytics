"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Search, TrendingUp, AlertTriangle, Lightbulb } from "lucide-react"

export default function DashboardPage() {
  const [playerTag, setPlayerTag] = useState("")
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<any>(null)

  const handleSync = async () => {
    if (!playerTag) return
    setLoading(true)
    try {
      const res = await fetch(`http://localhost:8000/player/${playerTag.replace("#", "")}/dashboard`)
      const result = await res.json()
      // モックデータとして、ギャップ分析やインサイトのダミーデータを付与する
      setData({
        ...result,
        insights: {
          hidden_weapons: ["dynamike", "barley"],
          needs_practice: ["piper", "leon"]
        },
        gap_analysis: [
          { char: "piper", global_win_rate: 58.2, personal_win_rate: 45.0 },
          { char: "dynamike", global_win_rate: 49.5, personal_win_rate: 62.1 },
          { char: "spike", global_win_rate: 54.0, personal_win_rate: 53.5 }
        ]
      })
    } catch (error) {
      console.error("Fetch error", error)
    } finally {
      setLoading(false)
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

      <Card className="bg-card/50 backdrop-blur-sm border-primary/20 shadow-sm">
        <CardHeader>
          <CardTitle>プレイヤー同期</CardTitle>
          <CardDescription>Brawl Starsのプレイヤータグを入力して最新のデータを取得します。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 max-w-md">
            <Input 
              placeholder="#Q2LL9G8" 
              value={playerTag}
              onChange={(e) => setPlayerTag(e.target.value)}
              className="bg-background/80"
            />
            <Button onClick={handleSync} disabled={loading} className="px-8 shadow-lg shadow-primary/20">
              {loading ? "同期中..." : (
                <>
                  <Search className="w-4 h-4 mr-2" />
                  同期
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <Card className="bg-card/80 backdrop-blur-sm shadow-[0_0_15px_rgba(var(--primary),0.1)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                メタ・ギャップ分析
              </CardTitle>
              <CardDescription>世間の勝率とあなたの勝率の差（マップ総合）</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {data.gap_analysis.map((item: any) => (
                <div key={item.char} className="space-y-2">
                  <div className="flex justify-between items-center text-sm font-medium">
                    <span className="capitalize text-lg">{item.char}</span>
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
              ))}
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
                <div className="flex gap-2">
                  {data.insights.hidden_weapons.map((char: string) => (
                    <Badge key={char} variant="default" className="text-sm px-3 py-1 capitalize bg-gradient-to-r from-primary to-accent border-none text-white shadow-md">
                      {char}
                    </Badge>
                  ))}
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
                <div className="flex gap-2">
                  {data.insights.needs_practice.map((char: string) => (
                    <Badge key={char} variant="destructive" className="text-sm px-3 py-1 capitalize shadow-md">
                      {char}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
