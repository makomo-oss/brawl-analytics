"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { translateMode, translateMap, getModeIconUrl } from "@/lib/translations"
import { getBrawlerInfo, BRAWLER_MAP } from "@/lib/brawlers"
import { Swords, Ban, Check, RefreshCw, Trophy, Target } from "lucide-react"

type Phase = "setup" | "ban" | "pick" | "done"
type Team = "ally" | "enemy"

// フェーズ進行と動的ウェイト定義
// 敵確定数 = enemyPicks.length
const WEIGHTS = [
  { W_map: 0.7, W_counter: 0.0, W_syn: 0.3 }, // 敵0体
  { W_map: 0.5, W_counter: 0.2, W_syn: 0.3 }, // 敵1体
  { W_map: 0.3, W_counter: 0.4, W_syn: 0.3 }, // 敵2体
  { W_map: 0.2, W_counter: 0.5, W_syn: 0.3 }, // 敵3体
]

export default function DraftCompanionPage() {
  const [phase, setPhase] = useState<Phase>("setup")
  const [categories, setCategories] = useState({ modes: [], maps: [] })
  
  // Setup State
  const [selectedMode, setSelectedMode] = useState("")
  const [selectedMap, setSelectedMap] = useState("")
  const [firstPick, setFirstPick] = useState<Team>("ally")
  
  // Draft State
  const [bans, setBans] = useState<string[]>([])
  const [allyPicks, setAllyPicks] = useState<string[]>([])
  const [enemyPicks, setEnemyPicks] = useState<string[]>([])
  
  // Data State
  const [metaData, setMetaData] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  // 初期ロード：カテゴリの取得
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await fetch("http://localhost:8000/meta/categories")
        if (res.ok) {
          const data = await res.json()
          setCategories(data)
          if (data.modes?.length > 0) setSelectedMode(data.modes[0])
          if (data.maps?.length > 0) setSelectedMap(data.maps[0])
        }
      } catch (err) {
        console.error(err)
      }
    }
    fetchCategories()
  }, [])

  // ドラフト開始時にメタデータをフェッチ
  const handleStartDraft = async () => {
    setLoading(true)
    try {
      const url = `http://localhost:8000/meta/tier-list?type=gachi&sub_type=map&id=${encodeURIComponent(selectedMap)}&include_details=true`
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setMetaData(data)
        setPhase("ban")
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setPhase("setup")
    setBans([])
    setAllyPicks([])
    setEnemyPicks([])
    setMetaData(null)
  }

  // ドラフトロジック：現在どちらのターンか？
  // BANフェーズ: 全6枠。交互。先攻からBAN開始。
  // Pickフェーズ: 全6枠。1-2-2-1 方式。先攻が1手目。
  const totalBans = bans.length
  const totalPicks = allyPicks.length + enemyPicks.length
  
  let currentTurnTeam: Team = "ally"
  let turnType: "ban" | "pick" = "ban"
  
  if (phase === "ban") {
    turnType = "ban"
    // BANは交互 (0: 先攻, 1: 後攻, 2: 先攻, 3: 後攻, 4: 先攻, 5: 後攻)
    const isFirstPickTurn = totalBans % 2 === 0
    currentTurnTeam = isFirstPickTurn ? firstPick : (firstPick === "ally" ? "enemy" : "ally")
  } else if (phase === "pick") {
    turnType = "pick"
    // Pickは 1-2-2-1 (0:先攻, 1:後攻, 2:後攻, 3:先攻, 4:先攻, 5:後攻)
    const pickOrder = ["first", "second", "second", "first", "first", "second"]
    if (totalPicks < 6) {
      const currentOrder = pickOrder[totalPicks]
      currentTurnTeam = currentOrder === "first" ? firstPick : (firstPick === "ally" ? "enemy" : "ally")
    }
  }

  // キャラクターを選択したときの処理
  const handleSelectCharacter = (charName: string) => {
    if (phase === "ban") {
      const newBans = [...bans, charName]
      setBans(newBans)
      if (newBans.length >= 6) {
        setPhase("pick")
      }
    } else if (phase === "pick") {
      if (currentTurnTeam === "ally") {
        const newAlly = [...allyPicks, charName]
        setAllyPicks(newAlly)
        if (newAlly.length >= 3 && enemyPicks.length >= 3) setPhase("done")
      } else {
        const newEnemy = [...enemyPicks, charName]
        setEnemyPicks(newEnemy)
        if (allyPicks.length >= 3 && newEnemy.length >= 3) setPhase("done")
      }
    }
  }

  // 除外判定（BANされた、またはPickされたキャラ）
  const isExcluded = (charName: string) => {
    return bans.includes(charName) || allyPicks.includes(charName) || enemyPicks.includes(charName)
  }

  // サジェスト計算ロジック
  const suggestions = useMemo(() => {
    if (!metaData || !metaData.characters) return []
    
    const chars = metaData.characters
    let results = []

    if (phase === "ban") {
      // おすすめBAN: マップ適性 (score) が高く、まだ除外されていないキャラ
      for (const [name, stats] of Object.entries<any>(chars)) {
        if (isExcluded(name)) continue
        results.push({ name, score: stats.score, reason: "マップTier高", type: "ban" })
      }
      results.sort((a, b) => b.score - a.score)
      return results.slice(0, 10)
    } 
    
    if (phase === "pick") {
      // おすすめPick
      const enemyCount = enemyPicks.length
      const W = WEIGHTS[enemyCount] || WEIGHTS[3]

      for (const [name, stats] of Object.entries<any>(chars)) {
        if (isExcluded(name)) continue
        
        // S_map: Tier Z-score
        const S_map = stats.score
        
        // S_counter: 敵Pickに対する勝率（50%を基準にプラスマイナス計算）
        let S_counter = 0
        let counterReason = ""
        
        if (enemyCount > 0) {
          let totalCounterScore = 0
          for (const enemy of enemyPicks) {
            // enemy に対するこのキャラ(name)の勝率を探す
            // kamo/tentekiリストに入っていればその勝率を使用、なければ50%と仮定
            let wrAgainstEnemy = 50.0
            
            // kamo(得意な相手)を探す
            const asKamo = stats.kamo?.find((k: any) => k.brawler === enemy)
            if (asKamo) wrAgainstEnemy = asKamo.win_rate
            
            // tenteki(苦手な相手)を探す
            const asTenteki = stats.tenteki?.find((t: any) => t.brawler === enemy)
            if (asTenteki) wrAgainstEnemy = asTenteki.win_rate
            
            // 50%からの差分を係数として加算 (例: 勝率60%なら +1.0)
            const diff = (wrAgainstEnemy - 50.0) / 10.0
            totalCounterScore += diff
            
            if (wrAgainstEnemy > 55) counterReason = `${getBrawlerInfo(enemy).nameJa}に有利`
          }
          S_counter = totalCounterScore / enemyCount
        }
        
        // S_syn: 今回は簡易的に0とする
        const S_syn = 0
        
        const finalScore = (W.W_map * S_map) + (W.W_counter * S_counter) + (W.W_syn * S_syn)
        
        results.push({ 
          name, 
          score: finalScore, 
          reason: counterReason || "マップ適性", 
          type: "pick",
          baseScore: S_map,
          counterScore: S_counter
        })
      }
      
      results.sort((a, b) => b.score - a.score)
      return results.slice(0, 10)
    }
    
    return []
  }, [phase, bans, allyPicks, enemyPicks, metaData])

  // ================= UI Components =================

  if (phase === "setup") {
    return (
      <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            BAN/Pick ドラフト支援
          </h1>
          <p className="text-muted-foreground">
            マップ適性と敵の編成から、リアルタイムで最適なキャラクターを弾き出します。
          </p>
        </div>

        <Card className="border-primary/20 shadow-lg">
          <CardHeader>
            <CardTitle>ドラフト初期設定</CardTitle>
            <CardDescription>現在の試合環境を入力してください。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <label className="text-sm font-bold">モード</label>
                <Select value={selectedMode} onValueChange={(val) => setSelectedMode(val || "")}>
                  <SelectTrigger className="bg-secondary/50">
                    <SelectValue placeholder="モードを選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.modes.map((m: string) => (
                      <SelectItem key={m} value={m}>{translateMode(m)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-3">
                <label className="text-sm font-bold">マップ</label>
                <Select value={selectedMap} onValueChange={(val) => setSelectedMap(val || "")}>
                  <SelectTrigger className="bg-secondary/50">
                    <SelectValue placeholder="マップを選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.maps.map((m: string) => (
                      <SelectItem key={m} value={m}>{translateMap(m)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-bold">自チームの順番</label>
              <div className="flex gap-4">
                <Button 
                  variant={firstPick === "ally" ? "default" : "outline"} 
                  className="w-full"
                  onClick={() => setFirstPick("ally")}
                >
                  先攻 (First Pick)
                </Button>
                <Button 
                  variant={firstPick === "enemy" ? "default" : "outline"} 
                  className="w-full"
                  onClick={() => setFirstPick("enemy")}
                >
                  後攻 (Second Pick)
                </Button>
              </div>
            </div>

            <Button 
              className="w-full mt-4" 
              size="lg" 
              onClick={handleStartDraft}
              disabled={loading || !selectedMap}
            >
              {loading ? "データ読み込み中..." : "ドラフトを開始する"}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-secondary/30 p-4 rounded-xl border border-primary/10">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            {phase === "ban" && <><Ban className="w-6 h-6 text-red-500" /> BANフェーズ</>}
            {phase === "pick" && <><Swords className="w-6 h-6 text-primary" /> Pickフェーズ</>}
            {phase === "done" && <><Check className="w-6 h-6 text-green-500" /> ドラフト完了</>}
          </h2>
          <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
            {translateMode(selectedMode)} - {translateMap(selectedMap)}
            <Badge variant="outline">{firstPick === "ally" ? "自チーム先攻" : "自チーム後攻"}</Badge>
          </p>
        </div>
        
        {phase !== "done" && (
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold">
              現在: <span className={currentTurnTeam === "ally" ? "text-blue-500" : "text-red-500"}>
                {currentTurnTeam === "ally" ? "味方のターン" : "敵のターン"}
              </span>
            </span>
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RefreshCw className="w-4 h-4 mr-2" /> リセット
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left/Top: Draft Board */}
        <div className="lg:col-span-8 space-y-6">
          <Card className="border-primary/20 shadow-md">
            <CardHeader className="pb-3 border-b bg-secondary/10">
              <CardTitle className="text-lg">ドラフトボード</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Ally Area */}
              <div className="space-y-3">
                <h3 className="font-bold text-blue-500 flex items-center justify-center gap-2 bg-blue-500/10 p-2 rounded-lg">
                  味方チーム (ALLY)
                </h3>
                <div className="flex flex-col gap-3">
                  {[0, 1, 2].map(i => {
                    const charName = allyPicks[i]
                    const isActive = phase === "pick" && currentTurnTeam === "ally" && allyPicks.length === i
                    return (
                      <div key={`ally-${i}`} className={`h-16 rounded-lg border-2 flex items-center p-2 gap-3 transition-all ${isActive ? 'border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)] animate-pulse' : 'border-secondary bg-secondary/20'}`}>
                        {charName ? (
                          <>
                            <Avatar className="w-10 h-10 border border-blue-500/50"><AvatarImage src={getBrawlerInfo(charName).imageUrl} /></Avatar>
                            <span className="font-bold">{getBrawlerInfo(charName).nameJa}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground text-sm mx-auto">Pick {i+1}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Enemy Area */}
              <div className="space-y-3">
                <h3 className="font-bold text-red-500 flex items-center justify-center gap-2 bg-red-500/10 p-2 rounded-lg">
                  敵チーム (ENEMY)
                </h3>
                <div className="flex flex-col gap-3">
                  {[0, 1, 2].map(i => {
                    const charName = enemyPicks[i]
                    const isActive = phase === "pick" && currentTurnTeam === "enemy" && enemyPicks.length === i
                    return (
                      <div key={`enemy-${i}`} className={`h-16 rounded-lg border-2 flex items-center p-2 gap-3 transition-all ${isActive ? 'border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)] animate-pulse' : 'border-secondary bg-secondary/20'}`}>
                        {charName ? (
                          <>
                            <Avatar className="w-10 h-10 border border-red-500/50"><AvatarImage src={getBrawlerInfo(charName).imageUrl} /></Avatar>
                            <span className="font-bold">{getBrawlerInfo(charName).nameJa}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground text-sm mx-auto">Pick {i+1}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Bans Area */}
              <div className="space-y-3">
                <h3 className="font-bold text-slate-500 flex items-center justify-center gap-2 bg-slate-500/10 p-2 rounded-lg">
                  <Ban className="w-4 h-4" /> BANS
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {[0, 1, 2, 3, 4, 5].map(i => {
                    const charName = bans[i]
                    const isActive = phase === "ban" && bans.length === i
                    return (
                      <div key={`ban-${i}`} className={`h-16 rounded-lg border-2 flex items-center justify-center relative overflow-hidden ${isActive ? 'border-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.5)] animate-pulse' : 'border-secondary bg-slate-900/50'}`}>
                        {charName ? (
                          <>
                            <Avatar className="w-10 h-10 opacity-50 grayscale"><AvatarImage src={getBrawlerInfo(charName).imageUrl} /></Avatar>
                            <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
                              <div className="w-full h-0.5 bg-red-500 rotate-45 absolute" />
                            </div>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">BAN</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

            </CardContent>
          </Card>

          {/* Character Pool */}
          {phase !== "done" && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm text-muted-foreground">キャラクターを選択して割り当てる</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-64 pr-4">
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
                    {Object.keys(BRAWLER_MAP).map(charName => {
                      const info = getBrawlerInfo(charName)
                      const excluded = isExcluded(charName)
                      return (
                        <div 
                          key={charName} 
                          onClick={() => !excluded && handleSelectCharacter(charName)}
                          className={`flex flex-col items-center gap-1 cursor-pointer transition-transform hover:scale-105 ${excluded ? 'opacity-20 cursor-not-allowed grayscale' : ''}`}
                        >
                          <Avatar className={`w-12 h-12 border-2 ${excluded ? 'border-transparent' : 'border-primary/20 hover:border-primary'}`}>
                            <AvatarImage src={info.imageUrl} />
                            <AvatarFallback>{info.nameJa[0]}</AvatarFallback>
                          </Avatar>
                          <span className="text-[10px] truncate w-full text-center">{info.nameJa}</span>
                        </div>
                      )
                    })}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Suggestions */}
        <div className="lg:col-span-4">
          <Card className="border-primary/50 shadow-lg bg-card/80 backdrop-blur-md h-full flex flex-col">
            <CardHeader className="border-b bg-primary/5">
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5 text-primary" />
                {phase === "ban" ? "おすすめ BAN" : "おすすめ Pick"}
              </CardTitle>
              <CardDescription>
                {phase === "ban" 
                  ? "現在のマップで驚異となるキャラクター" 
                  : "マップ適性と敵へのカウンター補正から算出"}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 pt-4 p-0">
              {phase === "done" ? (
                <div className="p-8 text-center text-muted-foreground">
                  ドラフトが完了しました。試合の健闘を祈ります！
                  <Button className="mt-4" onClick={handleReset}>新しいドラフトを始める</Button>
                </div>
              ) : (
                <ScrollArea className="h-[400px] lg:h-[600px] px-4">
                  <div className="space-y-3 pb-4">
                    {suggestions.map((sug: any, index: number) => {
                      const info = getBrawlerInfo(sug.name)
                      return (
                        <div 
                          key={sug.name} 
                          className="flex items-center gap-3 p-3 rounded-lg border bg-background hover:bg-secondary/50 transition-colors cursor-pointer"
                          onClick={() => handleSelectCharacter(sug.name)}
                        >
                          <div className="font-black text-lg w-6 text-center text-muted-foreground">
                            {index + 1}
                          </div>
                          <Avatar className="w-10 h-10 border border-primary/20">
                            <AvatarImage src={info.imageUrl} />
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold truncate">{info.nameJa}</div>
                            <div className="text-xs text-primary font-medium truncate">{sug.reason}</div>
                          </div>
                          <div className="text-right">
                            <Badge variant={phase === "ban" ? "destructive" : "default"}>
                              Score: {sug.score.toFixed(1)}
                            </Badge>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  )
}
