"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Search, TrendingUp, AlertTriangle, Lightbulb } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { getBrawlerInfo } from "@/lib/brawlers"

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
              {data.gap_analysis.map((item: any) => {
                const bInfo = getBrawlerInfo(item.char);
                return (
                <div key={item.char} className="space-y-2">
                  <div className="flex justify-between items-center text-sm font-medium">
                    <div className="flex items-center gap-2">
                      <Avatar className="w-8 h-8 border border-primary/20 shadow-sm">
                        <AvatarImage src={bInfo.imageUrl} />
                        <AvatarFallback>{bInfo.nameJa.charAt(0)}</AvatarFallback>
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
                  {data.insights.hidden_weapons.map((char: string) => {
                    const bInfo = getBrawlerInfo(char);
                    return (
                    <Badge key={char} variant="default" className="text-sm px-3 py-1.5 capitalize bg-gradient-to-r from-primary to-accent border-none text-white shadow-md flex items-center gap-2">
                      <Avatar className="w-5 h-5 border border-white/30">
                        <AvatarImage src={bInfo.imageUrl} />
                        <AvatarFallback>{bInfo.nameJa.charAt(0)}</AvatarFallback>
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
                  {data.insights.needs_practice.map((char: string) => {
                    const bInfo = getBrawlerInfo(char);
                    return (
                    <Badge key={char} variant="destructive" className="text-sm px-3 py-1.5 capitalize shadow-md flex items-center gap-2">
                      <Avatar className="w-5 h-5 border border-white/30">
                        <AvatarImage src={bInfo.imageUrl} />
                        <AvatarFallback>{bInfo.nameJa.charAt(0)}</AvatarFallback>
                      </Avatar>
                      {bInfo.nameJa}
                    </Badge>
                  )})}
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
            <Card className="bg-card/40 backdrop-blur-md border-primary/20 shadow-xl overflow-hidden p-2">
              <ScrollArea className="h-[600px] pr-4">
                <div className="space-y-3">
                  {data.recent_battles.map((battle: any, i: number) => {
                    const mainBInfo = getBrawlerInfo(battle.hero);
                    return (
                    <Card key={i} className="bg-background/40 border border-primary/10 overflow-hidden hover:bg-primary/5 transition-colors">
                      {/* Header section */}
                      <div className="p-3 border-b border-primary/10 flex justify-between items-center bg-card/60">
                        <div className="flex items-center gap-3">
                           <div className={`w-1.5 h-10 rounded-full ${battle.result === 'victory' ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : battle.result === 'defeat' ? 'bg-destructive shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]'}`} />
                           <div>
                             <Badge variant={battle.result === 'victory' ? 'default' : battle.result === 'defeat' ? 'destructive' : 'outline'} className="uppercase text-[10px] mb-1 px-2 font-bold tracking-wider">
                               {battle.result}
                             </Badge>
                             <p className="text-xs text-muted-foreground">{battle.mode} <span className="opacity-50">|</span> {battle.map}</p>
                           </div>
                        </div>
                        <div className="text-right flex items-center gap-3">
                          <Avatar className="w-10 h-10 border-2 border-primary/20 shadow-md">
                            <AvatarImage src={mainBInfo.imageUrl} />
                            <AvatarFallback>{mainBInfo.nameJa.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div className="w-16 text-right">
                            <p className={`font-bold text-lg ${battle.trophy_change > 0 ? 'text-green-500' : battle.trophy_change < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                              {battle.trophy_change > 0 ? '+' : ''}{battle.trophy_change} 🏆
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      {/* Teams section */}
                      <div className="p-3 grid grid-cols-2 gap-4 bg-background/20">
                        {/* My Team */}
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-primary/80 border-b border-primary/10 pb-1">味方チーム</p>
                          <div className="flex flex-col gap-1.5">
                            {battle.my_team && battle.my_team.map((p: any, idx: number) => {
                              const bInfo = getBrawlerInfo(p.brawler);
                              return (
                                <div key={idx} className="flex items-center gap-2">
                                  <Avatar className="w-6 h-6 border border-primary/20 bg-background">
                                    <AvatarImage src={bInfo.imageUrl} />
                                    <AvatarFallback className="text-[8px]">{bInfo.nameJa.charAt(0)}</AvatarFallback>
                                  </Avatar>
                                  <span className="text-xs truncate max-w-[90px]" title={p.name}>{p.name}</span>
                                  <span className="text-[10px] text-muted-foreground ml-auto">{bInfo.nameJa}</span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                        {/* Opponent Teams */}
                        <div className="space-y-2 border-l border-primary/10 pl-4">
                          <p className="text-xs font-semibold text-destructive/80 border-b border-destructive/10 pb-1">相手チーム</p>
                          <div className="flex flex-col gap-1.5">
                            {battle.opponent_teams && battle.opponent_teams.map((team: any, t_idx: number) => (
                              <div key={t_idx} className="space-y-1.5">
                                {team.map((p: any, idx: number) => {
                                  const bInfo = getBrawlerInfo(p.brawler);
                                  return (
                                    <div key={`${t_idx}-${idx}`} className="flex items-center gap-2">
                                      <Avatar className="w-6 h-6 border border-destructive/20 bg-background">
                                        <AvatarImage src={bInfo.imageUrl} />
                                        <AvatarFallback className="text-[8px]">{bInfo.nameJa.charAt(0)}</AvatarFallback>
                                      </Avatar>
                                      <span className="text-xs truncate max-w-[90px]" title={p.name}>{p.name}</span>
                                      <span className="text-[10px] text-muted-foreground ml-auto">{bInfo.nameJa}</span>
                                    </div>
                                  )
                                })}
                                {t_idx < battle.opponent_teams.length - 1 && <Separator className="my-1.5 opacity-30 bg-destructive/20" />}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </Card>
                  )})}
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
