"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Search, TrendingUp, AlertTriangle, Lightbulb, Trophy, Swords, Star } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { getBrawlerInfo } from "@/lib/brawlers"
import { translateMode, translateMap, getModeIconUrl } from "@/lib/translations"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"

function formatBattleTime(timeStr: string) {
  // ISO 8601 形式のパースとフォーマット
  const d = new Date(timeStr);
  if (isNaN(d.getTime())) return timeStr;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function getRankImage(rankValue: number) {
  if (!rankValue || rankValue <= 0) return null;
  if (rankValue >= 19) return { name: "MASTERS", url: "https://cdn.brawlify.com/ranked/regular/Masters.png", tier: "" };
  
  const tiers = ["Bronze", "Silver", "Gold", "Diamond", "Mythic", "Legendary"];
  
  const tierIndex = Math.floor((rankValue - 1) / 3);
  const subTier = ((rankValue - 1) % 3) + 1; // 1, 2, 3
  const numerals = ["I", "II", "III"];
  
  return {
    name: `${tiers[tierIndex].toUpperCase()}`,
    url: `https://cdn.brawlify.com/ranked/regular/${tiers[tierIndex]}.png`,
    tier: numerals[subTier - 1]
  };
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
  const [playerTag, setPlayerTag] = useState("")
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<DashboardData | null>(null)
  const [battleTab, setBattleTab] = useState("battles")

  const handleSync = async (overrideTag?: string) => {
    const tagToFetch = overrideTag || playerTag
    if (!tagToFetch) return
    if (overrideTag) setPlayerTag(overrideTag)
    setLoading(true)
    try {
      const res = await fetch(`http://localhost:8000/player/${tagToFetch.replace("#", "")}/dashboard`)
      const result = await res.json()
      setData(result)
      window.scrollTo({ top: 0, behavior: 'smooth' })
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
            <Button onClick={() => handleSync()} disabled={loading} className="px-8 shadow-lg shadow-primary/20">
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
            /* Profile Card */
            <Card className="border-t-4 border-t-blue-500 shadow-md mb-8">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-6">
                  <Avatar className="w-20 h-20 border-2 border-primary/20 shadow-sm">
                    <AvatarImage src={`https://cdn.brawlify.com/profile-icons/regular/${data.profile?.icon_id || 28000000}.png`} />
                    <AvatarFallback className="bg-primary/10 text-2xl font-bold">{data.profile?.name?.[0]}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <CardTitle className="text-3xl font-extrabold tracking-tight">{data.profile?.name}</CardTitle>
                    <div className="flex items-center gap-2 mt-1 text-muted-foreground">
                      <span className="font-medium">{data.player_tag}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground font-semibold">
                        {data.profile?.club_name || "No Club"}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-4">
                <div className="text-right bg-primary/5 px-4 py-2 rounded-xl">
                  <div className="text-sm font-semibold text-muted-foreground flex items-center justify-end gap-1">
                    <Trophy className="w-4 h-4 text-yellow-500" /> トロフィー
                  </div>
                  <div className="text-2xl font-black text-primary">{data.profile?.trophies.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">最高: {data.profile?.highest_trophies.toLocaleString()}</div>
                </div>
                {data.profile?.ranked_elo ? (
                  <div className="flex items-center gap-3">
                    {data.profile.ranked_rank > 0 && (() => {
                      const rankInfo = getRankImage(data.profile.ranked_rank);
                      if (!rankInfo) return null;
                      return (
                        <div className="relative w-16 h-16 drop-shadow-md flex items-center justify-center transform hover:scale-105 transition-transform">
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
                    <div className="text-right bg-purple-500/5 px-4 py-2 rounded-xl border border-purple-500/10">
                      <div className="text-sm font-semibold text-purple-600 dark:text-purple-400 flex items-center justify-end gap-1">
                        <Swords className="w-4 h-4" /> ガチバトル現在スコア
                      </div>
                      <div className="text-2xl font-black text-purple-600 dark:text-purple-400">{data.profile.ranked_elo.toLocaleString()}</div>
                      <div className="text-xs text-purple-500/70">最高: {data.profile.highest_ranked_elo.toLocaleString()}</div>
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
                  {data.insights?.hidden_weapons.map((char: string) => {
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
                  {data.insights?.needs_practice.map((char: string) => {
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
                      <h3 className="font-bold text-lg">{modeStat.mode}</h3>
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
                          <span>{modeStat.wins} Wins</span>
                          <span>{modeStat.matches - modeStat.wins} Losses</span>
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
                                  <AvatarFallback>{bInfo.nameJa.charAt(0)}</AvatarFallback>
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
                        <Card key={i} className="bg-background/40 border border-primary/10 overflow-hidden hover:bg-primary/5 transition-colors">
                      {/* Header section */}
                       <div className="p-3 border-b border-primary/10 flex justify-between items-center bg-card/60">
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
                               <img src={getModeIconUrl(battle.mode)} alt={battle.mode} className="w-4 h-4 object-contain drop-shadow-md" />
                               <span className="font-medium text-foreground/80">{translateMode(battle.mode)}</span>
                               <span className="opacity-40">|</span>
                               <span>{translateMap(battle.map)}</span>
                             </div>
                           </div>
                        </div>
                        <div className="text-right flex items-center gap-4">
                          <Avatar className="w-12 h-12 border-2 border-primary/30 shadow-[0_0_15px_rgba(var(--primary),0.2)]">
                            <AvatarImage src={mainBInfo.imageUrl} />
                            <AvatarFallback>{mainBInfo.nameJa.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div className="w-20 text-right flex justify-end">
                            {scoreDisplay}
                          </div>
                        </div>
                      </div>
                      
                      {/* Teams section */}
                      <div className="p-3 grid grid-cols-2 gap-4 bg-background/30 backdrop-blur-sm">
                        {/* My Team */}
                        <div className="space-y-3 relative">
                          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -z-10" />
                          <p className="text-xs font-bold text-primary tracking-widest border-b border-primary/20 pb-1.5 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                            味方チーム
                          </p>
                          <div className="flex flex-col gap-2.5">
                            {battle.my_team && battle.my_team.map((p: any, idx: number) => {
                              const bInfo = getBrawlerInfo(p.brawler);
                              const isMe = p.brawler.toLowerCase() === battle.hero.toLowerCase(); // 簡易判定
                              return (
                                <div 
                                  key={idx} 
                                  onClick={() => handleSync(p.tag)}
                                  className={`flex items-center gap-3 p-1.5 rounded-xl transition-colors group cursor-pointer ${isMe ? 'bg-primary/10 border border-primary/20' : 'hover:bg-white/5 border border-transparent'}`}
                                >
                                  <Avatar className={`w-10 h-10 shadow-sm transition-transform group-hover:scale-105 ${isMe ? 'border border-primary ring-2 ring-primary/30 ring-offset-1 ring-offset-background' : 'border border-primary/20'}`}>
                                    <AvatarImage src={bInfo.imageUrl} />
                                    <AvatarFallback>{bInfo.nameJa.charAt(0)}</AvatarFallback>
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
                          <div className="absolute top-0 right-0 w-32 h-32 bg-destructive/5 rounded-full blur-3xl -z-10" />
                          <p className="text-xs font-bold text-destructive tracking-widest border-b border-destructive/20 pb-1.5 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-destructive" />
                            相手チーム
                          </p>
                          <div className="flex flex-col gap-2.5">
                            {battle.opponent_teams && battle.opponent_teams.map((team: any, t_idx: number) => (
                              <div key={t_idx} className="space-y-2.5">
                                {team.map((p: any, idx: number) => {
                                  const bInfo = getBrawlerInfo(p.brawler);
                                  return (
                                    <div 
                                      key={`${t_idx}-${idx}`} 
                                      onClick={() => handleSync(p.tag)}
                                      className="flex items-center gap-3 p-1.5 rounded-xl hover:bg-white/5 transition-colors group cursor-pointer border border-transparent"
                                    >
                                      <Avatar className="w-10 h-10 border border-destructive/30 shadow-sm transition-transform group-hover:scale-105">
                                        <AvatarImage src={bInfo.imageUrl} />
                                        <AvatarFallback>{bInfo.nameJa.charAt(0)}</AvatarFallback>
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
              {data.brawlers?.sort((a, b) => b.trophies - a.trophies).map((brawler, idx) => {
                const maxPower = 11;
                const powerRatio = (brawler.power / maxPower) * 100;
                
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
                          {brawler.power}
                        </div>
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <h4 className="font-extrabold text-lg truncate tracking-tight">{brawler.name}</h4>
                        <div className="flex items-center gap-1.5 mt-0.5 text-xs font-semibold text-muted-foreground">
                          <Trophy className="w-3.5 h-3.5 text-yellow-500" />
                          <span className="text-yellow-600 dark:text-yellow-400">{brawler.trophies}</span>
                          <span className="opacity-50">/</span>
                          <span>{brawler.highestTrophies}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="px-3 py-2.5 bg-secondary/10 flex flex-col gap-2">
                      <div className="flex items-center justify-between text-xs font-medium">
                        <span className="text-muted-foreground">パワーレベル</span>
                        <span className={brawler.power === 11 ? "text-green-500 font-bold" : ""}>{brawler.power} / {maxPower}</span>
                      </div>
                      <Progress value={powerRatio} className="h-1.5" />
                      
                      <div className="grid grid-cols-4 gap-2 mt-2 pt-2 border-t border-border/50">
                        {/* Gadgets */}
                        <div className="flex flex-col gap-1 items-center">
                          <span className="text-[9px] font-bold text-green-500">Gadget</span>
                          <div className="flex gap-1 justify-center flex-wrap">
                            {brawler.gadgets.length > 0 ? brawler.gadgets.map((g) => (
                              <img key={g.id} src={`https://cdn.brawlify.com/gadgets/regular/${g.id}.png`} alt={g.name} className="w-6 h-6 rounded-full border border-green-500/50 shadow-sm" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                            )) : <span className="text-muted-foreground text-[10px]">-</span>}
                          </div>
                        </div>
                        {/* Star Powers */}
                        <div className="flex flex-col gap-1 items-center">
                          <span className="text-[9px] font-bold text-yellow-500">StarPower</span>
                          <div className="flex gap-1 justify-center flex-wrap">
                            {brawler.starPowers.length > 0 ? brawler.starPowers.map((s) => (
                              <img key={s.id} src={`https://cdn.brawlify.com/star-powers/regular/${s.id}.png`} alt={s.name} className="w-6 h-6 rounded-full border border-yellow-500/50 shadow-sm" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                            )) : <span className="text-muted-foreground text-[10px]">-</span>}
                          </div>
                        </div>
                        {/* Gears */}
                        <div className="flex flex-col gap-1 items-center">
                          <span className="text-[9px] font-bold text-blue-500">Gear</span>
                          <div className="flex gap-1 justify-center flex-wrap">
                            {brawler.gears.length > 0 ? brawler.gears.map((g) => (
                              <img key={g.id} src={`https://cdn.brawlify.com/gears/regular/${g.id}.png`} alt={g.name} className="w-6 h-6 rounded-full border border-blue-500/50 shadow-sm" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                            )) : <span className="text-muted-foreground text-[10px]">-</span>}
                          </div>
                        </div>
                        {/* Hypercharge */}
                        <div className="flex flex-col gap-1 items-center">
                          <span className="text-[9px] font-bold text-purple-500">Hyper</span>
                          <div className="flex gap-1 justify-center flex-wrap">
                            {brawler.hyperCharges.length > 0 ? brawler.hyperCharges.map((h) => (
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
