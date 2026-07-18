"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Search, TrendingUp, AlertTriangle, Lightbulb } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

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
      setData(result)
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
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 mt-8">
          {data.profile && (
            <Card className="bg-card/50 backdrop-blur-sm border-border mb-8">
              <CardHeader>
                <CardTitle className="text-2xl flex items-center gap-2">
                  {data.profile.name} <Badge variant="outline" className="text-sm font-normal">{data.profile.club_name}</Badge>
                </CardTitle>
                <CardDescription className="text-muted-foreground flex gap-4">
                  <span>🏆 {data.profile.trophies.toLocaleString()} (最高: {data.profile.highest_trophies.toLocaleString()})</span>
                  <span>🌟 レベル: {data.profile.level}</span>
                  <span>⚔️ 3v3勝利数: {data.profile["3v3_victories"].toLocaleString()}</span>
                </CardDescription>
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

        {/* 直近のバトル履歴セクション */}
        {data.recent_battles && data.recent_battles.length > 0 && (
          <div className="mt-12 space-y-4 animate-in fade-in slide-in-from-bottom-8 duration-700">
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2 text-primary/80">
              ⚔️ 直近のバトル履歴
            </h2>
            <Card className="bg-card/40 backdrop-blur-md border-primary/20 shadow-xl overflow-hidden">
              <ScrollArea className="h-[500px]">
                <div className="p-4 space-y-2">
                  <Accordion className="w-full">
                    {data.recent_battles.map((battle: any, i: number) => (
                      <AccordionItem value={`item-${i}`} key={i} className="border-b-0 mb-2 bg-background/20 rounded-lg">
                        <AccordionTrigger className="hover:bg-primary/5 px-3 py-2 rounded-lg transition-all duration-300 hover:no-underline">
                          <div className="flex items-center justify-between w-full text-left">
                            <div className="flex items-center gap-4">
                              <div className={`w-2 h-12 rounded-full ${battle.result === 'victory' ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : battle.result === 'defeat' ? 'bg-destructive shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]'}`} />
                              <div>
                                <p className="font-bold text-lg capitalize tracking-wide">{battle.hero}</p>
                                <p className="text-sm text-muted-foreground">{battle.mode} <span className="opacity-50">|</span> {battle.map}</p>
                              </div>
                            </div>
                            <div className="text-right flex flex-col items-end justify-center mr-4">
                              <Badge variant={battle.result === 'victory' ? 'default' : battle.result === 'defeat' ? 'destructive' : 'outline'} className="mb-1 uppercase shadow-sm text-xs font-bold tracking-wider">
                                {battle.result}
                              </Badge>
                              <p className={`font-semibold text-sm ${battle.trophy_change > 0 ? 'text-green-500' : battle.trophy_change < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                                {battle.trophy_change > 0 ? '+' : ''}{battle.trophy_change} 🏆
                              </p>
                            </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-4 pb-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                            <div className="space-y-2 bg-primary/5 p-3 rounded-md">
                              <p className="font-semibold text-primary text-sm mb-2 border-b border-primary/20 pb-1">味方チーム</p>
                              {battle.my_team && battle.my_team.map((p: any, idx: number) => (
                                <div key={idx} className="flex justify-between items-center text-sm">
                                  <span className="truncate max-w-[120px]">{p.name}</span>
                                  <Badge variant="outline" className="capitalize text-xs font-normal">{p.brawler}</Badge>
                                </div>
                              ))}
                            </div>
                            <div className="space-y-2 bg-destructive/5 p-3 rounded-md">
                              <p className="font-semibold text-destructive text-sm mb-2 border-b border-destructive/20 pb-1">相手チーム</p>
                              {battle.opponent_teams && battle.opponent_teams.map((team: any, t_idx: number) => (
                                <div key={t_idx} className="space-y-1">
                                  {team.map((p: any, idx: number) => (
                                    <div key={`${t_idx}-${idx}`} className="flex justify-between items-center text-sm">
                                      <span className="truncate max-w-[120px]">{p.name}</span>
                                      <Badge variant="outline" className="capitalize text-xs font-normal border-destructive/30">{p.brawler}</Badge>
                                    </div>
                                  ))}
                                  {t_idx < battle.opponent_teams.length - 1 && <Separator className="my-1 opacity-50 bg-destructive/20" />}
                                </div>
                              ))}
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </div>
              </ScrollArea>
            </Card>
          </div>
        )}
        </div>
      )}
    </div>
  )
}
