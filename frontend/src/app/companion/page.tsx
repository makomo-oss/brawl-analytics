"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { translateMode, translateMap, getModeIconUrl } from "@/lib/translations"
import { getBrawlerInfo, BRAWLER_MAP } from "@/lib/brawlers"
import { Swords, Ban, Check, RefreshCw, Trophy, Target, User } from "lucide-react"
import { API_URL } from "@/lib/config"

type Phase = "setup" | "ban" | "pick" | "done"
type Team = "blue" | "red"

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
  const [categories, setCategories] = useState({ modes: [], maps: [], mode_to_maps: {} as Record<string, string[]> })
  
  // Setup State
  const [selectedMode, setSelectedMode] = useState("")
  const [selectedMap, setSelectedMap] = useState("")
  const [myTeam, setMyTeam] = useState<Team>("blue")
  const [firstPickTeam, setFirstPickTeam] = useState<Team>("blue")
  
  // Draft State
  const [allyBans, setAllyBans] = useState<string[]>([])
  const [enemyBans, setEnemyBans] = useState<string[]>([])
  const [bluePicks, setBluePicks] = useState<string[]>([])
  const [redPicks, setRedPicks] = useState<string[]>([])
  
  // Data State
  const [metaData, setMetaData] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  // 初期ロード：カテゴリの取得
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await fetch(`${API_URL}/meta/categories`)
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

  // 選択されたモードに属するマップを計算
  const availableMaps = useMemo(() => {
    if (!selectedMode || !categories.mode_to_maps || !categories.mode_to_maps[selectedMode]) {
      return categories.maps
    }
    return categories.mode_to_maps[selectedMode]
  }, [selectedMode, categories])

  // モードが変わった時に、選択中マップが含まれていなければ自動補正する
  useEffect(() => {
    if (availableMaps.length > 0 && (!selectedMap || !availableMaps.includes(selectedMap))) {
      setSelectedMap(availableMaps[0])
    }
  }, [availableMaps, selectedMap])

  // ドラフト開始時にメタデータをフェッチ
  const handleStartDraft = async () => {
    setLoading(true)
    try {
      const url = `${API_URL}/meta/tier-list?type=gachi&sub_type=map&id=${encodeURIComponent(selectedMap)}&include_details=true`
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
    setAllyBans([])
    setEnemyBans([])
    setBluePicks([])
    setRedPicks([])
    setMetaData(null)
  }

  // ドラフトロジック：現在どちらのターンか？
  // BANフェーズ: 先に味方が3枠、そのあとに敵が3枠（ブラインドBANをシミュレート）
  // Pickフェーズ: 全6枠。1-2-2-1方式。
  const totalPicks = bluePicks.length + redPicks.length
  
  let currentTurnTeam: Team = "blue"
  let turnType: "ban" | "pick" = "ban"
  
  if (phase === "ban") {
    turnType = "ban"
    if (allyBans.length < 3) {
      currentTurnTeam = myTeam
    } else {
      currentTurnTeam = myTeam === "blue" ? "red" : "blue"
    }
  } else if (phase === "pick") {
    turnType = "pick"
    const pickOrder = ["first", "second", "second", "first", "first", "second"]
    if (totalPicks < 6) {
      const order = pickOrder[totalPicks]
      currentTurnTeam = order === "first" ? firstPickTeam : (firstPickTeam === "blue" ? "red" : "blue")
    }
  }

  // キャラクターを選択したときの処理
  const handleSelectCharacter = (charName: string) => {
    if (phase === "ban") {
      if (currentTurnTeam === myTeam) {
        const newBans = [...allyBans, charName]
        setAllyBans(newBans)
      } else {
        const newBans = [...enemyBans, charName]
        setEnemyBans(newBans)
        if (newBans.length >= 3) {
          setPhase("pick")
        }
      }
    } else if (phase === "pick") {
      if (currentTurnTeam === "blue") {
        const newBlue = [...bluePicks, charName]
        setBluePicks(newBlue)
        if (newBlue.length >= 3 && redPicks.length >= 3) setPhase("done")
      } else {
        const newRed = [...redPicks, charName]
        setRedPicks(newRed)
        if (bluePicks.length >= 3 && newRed.length >= 3) setPhase("done")
      }
    }
  }

  // 除外判定
  const isExcluded = (charName: string) => {
    if (phase === "ban") {
      if (currentTurnTeam === myTeam) {
        return allyBans.includes(charName)
      } else {
        return enemyBans.includes(charName)
      }
    }
    // Pickフェーズでは、BANされたキャラとPickされたキャラすべてを除外
    return allyBans.includes(charName) || enemyBans.includes(charName) || bluePicks.includes(charName) || redPicks.includes(charName)
  }

  // 自分のチームのピック、敵のチームのピックを取得
  const allyPicks = myTeam === "blue" ? bluePicks : redPicks
  const enemyPicks = myTeam === "blue" ? redPicks : bluePicks

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
  }, [phase, allyBans, enemyBans, bluePicks, redPicks, metaData, enemyPicks])

  // 勝率予測計算
  const predictedWinRate = useMemo(() => {
    if (phase !== "done" || !metaData || !metaData.characters) return 50
    let myScore = 0
    let enemyScore = 0
    
    allyPicks.forEach(c => myScore += metaData.characters[c]?.score || 0)
    enemyPicks.forEach(c => enemyScore += metaData.characters[c]?.score || 0)
    
    const diff = myScore - enemyScore
    // シグモイド関数で勝率に変換 (係数2.0で適度に丸める)
    const p = 1 / (1 + Math.exp(-2.0 * diff))
    return Math.round(p * 100)
  }, [phase, allyPicks, enemyPicks, metaData])

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
                    <SelectValue placeholder="モードを選択">
                      {selectedMode ? translateMode(selectedMode) : "モードを選択"}
                    </SelectValue>
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
                    <SelectValue placeholder="マップを選択">
                      {selectedMap ? translateMap(selectedMap) : "マップを選択"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {availableMaps.map((m: string) => (
                      <SelectItem key={m} value={m}>{translateMap(m)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <label className="text-sm font-bold">自チーム</label>
                <Tabs value={myTeam} onValueChange={(val) => setMyTeam(val as Team)}>
                  <TabsList className="grid w-full grid-cols-2 h-11 bg-secondary/50">
                    <TabsTrigger value="blue" className="h-full data-[state=active]:!bg-blue-600 data-[state=active]:!text-white">
                      青チーム
                    </TabsTrigger>
                    <TabsTrigger value="red" className="h-full data-[state=active]:!bg-red-600 data-[state=active]:!text-white">
                      赤チーム
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-bold">先攻チーム</label>
                <Tabs value={firstPickTeam} onValueChange={(val) => setFirstPickTeam(val as Team)}>
                  <TabsList className="grid w-full grid-cols-2 h-11 bg-secondary/50">
                    <TabsTrigger value="blue" className="h-full data-[state=active]:!bg-blue-600 data-[state=active]:!text-white">
                      青チーム
                    </TabsTrigger>
                    <TabsTrigger value="red" className="h-full data-[state=active]:!bg-red-600 data-[state=active]:!text-white">
                      赤チーム
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
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
            <Badge variant="outline" className={myTeam === "blue" ? "text-blue-500 border-blue-200" : "text-red-500 border-red-200"}>
              自チーム: {myTeam === "blue" ? "青チーム" : "赤チーム"}
            </Badge>
            <Badge variant="secondary">
              先攻: {firstPickTeam === "blue" ? "青チーム" : "赤チーム"}
            </Badge>
          </p>
        </div>
        
        {phase !== "done" && (
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold">
              現在: <span className={currentTurnTeam === "blue" ? "text-blue-500" : "text-red-500"}>
                {currentTurnTeam === "blue" ? "青チームのターン" : "赤チームのターン"}
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
            <CardContent className="pt-4 grid grid-cols-3 gap-2 sm:gap-6">
              
              {/* Blue Team Area */}
              <div className="space-y-3">
                <h3 className="font-bold text-blue-500 flex flex-col items-center justify-center bg-blue-500/10 p-1 sm:p-2 rounded-lg text-[10px] sm:text-base leading-tight">
                  <span>青チーム</span>
                  <span className="font-normal">{firstPickTeam === "blue" ? "(先攻)" : "(後攻)"}</span>
                </h3>
                <div className="flex flex-col gap-3">
                  {[0, 1, 2].map(i => {
                    const charName = bluePicks[i]
                    const isActive = phase === "pick" && currentTurnTeam === "blue" && bluePicks.length === i
                    return (
                      <div key={`blue-${i}`} className={`h-12 sm:h-16 rounded-lg border-2 flex flex-col sm:flex-row items-center justify-center sm:justify-start p-1 sm:p-2 gap-1 sm:gap-3 transition-all ${isActive ? 'border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)] animate-pulse' : 'border-secondary bg-secondary/20'}`}>
                        {charName ? (
                          <>
                            <div className="w-6 h-6 sm:w-10 sm:h-10 border border-blue-500/50 rounded-md shrink-0 bg-primary/10 relative">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={getBrawlerInfo(charName).imageUrl} alt={charName} className="object-cover w-full h-full rounded-sm absolute inset-0 z-10" />
                            </div>
                            <span className="font-bold text-[8px] sm:text-sm truncate w-full text-center sm:text-left">{getBrawlerInfo(charName).nameJa}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground text-[10px] sm:text-sm mx-auto">Pick {i+1}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Red Team Area */}
              <div className="space-y-3">
                <h3 className="font-bold text-red-500 flex flex-col items-center justify-center bg-red-500/10 p-1 sm:p-2 rounded-lg text-[10px] sm:text-base leading-tight">
                  <span>赤チーム</span>
                  <span className="font-normal">{firstPickTeam === "red" ? "(先攻)" : "(後攻)"}</span>
                </h3>
                <div className="flex flex-col gap-3">
                  {[0, 1, 2].map(i => {
                    const charName = redPicks[i]
                    const isActive = phase === "pick" && currentTurnTeam === "red" && redPicks.length === i
                    return (
                      <div key={`red-${i}`} className={`h-12 sm:h-16 rounded-lg border-2 flex flex-col sm:flex-row items-center justify-center sm:justify-start p-1 sm:p-2 gap-1 sm:gap-3 transition-all ${isActive ? 'border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)] animate-pulse' : 'border-secondary bg-secondary/20'}`}>
                        {charName ? (
                          <>
                            <div className="w-6 h-6 sm:w-10 sm:h-10 border border-red-500/50 rounded-md shrink-0 bg-primary/10 relative">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={getBrawlerInfo(charName).imageUrl} alt={charName} className="object-cover w-full h-full rounded-sm absolute inset-0 z-10" />
                            </div>
                            <span className="font-bold text-[8px] sm:text-sm truncate w-full text-center sm:text-left">{getBrawlerInfo(charName).nameJa}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground text-[10px] sm:text-sm mx-auto">Pick {i+1}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Bans Area */}
              <div className="space-y-3">
                <h3 className="font-bold text-slate-500 flex flex-col items-center justify-center bg-slate-500/10 p-1 sm:p-2 rounded-lg text-[10px] sm:text-base leading-tight">
                  <span className="flex items-center gap-1"><Ban className="w-3 h-3 sm:w-4 sm:h-4" /> BANS</span>
                  <span className="font-normal opacity-0">.</span>
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  {/* Ally Bans */}
                  <div className="space-y-2">
                    <div className="text-xs text-center font-bold text-muted-foreground">味方 BAN</div>
                    <div className="flex flex-col gap-2">
                      {[0, 1, 2].map(i => {
                        const charName = allyBans[i]
                        const isActive = phase === "ban" && currentTurnTeam === myTeam && allyBans.length === i
                        return (
                          <div key={`allyban-${i}`} className={`h-12 sm:h-16 rounded-lg border-2 flex flex-col sm:flex-row items-center justify-center sm:justify-start p-1 sm:p-2 gap-1 sm:gap-3 relative overflow-hidden ${isActive ? 'border-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)] animate-pulse' : 'border-secondary bg-slate-900/50'}`}>
                            {charName ? (
                              <>
                                <div className="w-6 h-6 sm:w-10 sm:h-10 opacity-50 grayscale rounded-md shrink-0 bg-primary/10 relative">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={getBrawlerInfo(charName).imageUrl} alt={charName} className="object-cover w-full h-full rounded-sm absolute inset-0 z-10" />
                                </div>
                                <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center pointer-events-none">
                                  <div className="w-full h-0.5 bg-red-500 rotate-45 absolute" />
                                </div>
                                <span className="font-bold text-[8px] sm:text-sm truncate w-full text-center sm:text-left z-10 hidden sm:block">{getBrawlerInfo(charName).nameJa}</span>
                              </>
                            ) : (
                              <span className="text-[10px] sm:text-sm text-muted-foreground mx-auto">BAN</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  {/* Enemy Bans */}
                  <div className="space-y-2">
                    <div className="text-xs text-center font-bold text-muted-foreground">相手 BAN</div>
                    <div className="flex flex-col gap-2">
                      {[0, 1, 2].map(i => {
                        const charName = enemyBans[i]
                        const isActive = phase === "ban" && currentTurnTeam !== myTeam && enemyBans.length === i
                        return (
                          <div key={`enemyban-${i}`} className={`h-12 sm:h-16 rounded-lg border-2 flex flex-col sm:flex-row items-center justify-center sm:justify-start p-1 sm:p-2 gap-1 sm:gap-3 relative overflow-hidden ${isActive ? 'border-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)] animate-pulse' : 'border-secondary bg-slate-900/50'}`}>
                            {charName ? (
                              <>
                                <div className="w-6 h-6 sm:w-10 sm:h-10 opacity-50 grayscale rounded-md shrink-0 bg-primary/10 relative">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={getBrawlerInfo(charName).imageUrl} alt={charName} className="object-cover w-full h-full rounded-sm absolute inset-0 z-10" />
                                </div>
                                <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center pointer-events-none">
                                  <div className="w-full h-0.5 bg-red-500 rotate-45 absolute" />
                                </div>
                                <span className="font-bold text-[8px] sm:text-sm truncate w-full text-center sm:text-left z-10 hidden sm:block">{getBrawlerInfo(charName).nameJa}</span>
                              </>
                            ) : (
                              <span className="text-[10px] sm:text-sm text-muted-foreground mx-auto">BAN</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>

            </CardContent>
          </Card>

          {/* Win Rate Prediction (Done Phase) */}
          {phase === "done" && (
            <Card className="col-span-1 md:col-span-2 shadow-lg border-primary/20 bg-gradient-to-b from-background to-secondary/10">
              <CardContent className="p-8 flex flex-col items-center justify-center space-y-4">
                <div className="flex items-center gap-3 text-primary">
                  <Trophy className="w-8 h-8 text-yellow-500" />
                  <h2 className="text-2xl font-bold">予測勝率</h2>
                </div>
                <div className="relative">
                  <svg className="w-48 h-48 transform -rotate-90">
                    <circle cx="96" cy="96" r="80" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-muted/20" />
                    <circle 
                      cx="96" cy="96" r="80" stroke="currentColor" strokeWidth="12" fill="transparent" 
                      strokeDasharray="502" 
                      strokeDashoffset={502 - (502 * predictedWinRate) / 100}
                      className={predictedWinRate >= 50 ? "text-blue-500 transition-all duration-1000 ease-out" : "text-red-500 transition-all duration-1000 ease-out"} 
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-5xl font-extrabold">{predictedWinRate}%</span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground text-center max-w-[300px]">
                  現在の環境メタとマップ適正度に基づく自チームの理論上の勝率です
                </p>
                <Button className="mt-4" size="lg" onClick={handleReset}>
                  <RefreshCw className="w-4 h-4 mr-2" /> 新しいドラフトを始める
                </Button>
              </CardContent>
            </Card>
          )}

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
                          <div className="w-8 h-8 sm:w-12 sm:h-12 border-2 border-black/20 dark:border-white/10 group-hover:border-primary transition-colors shrink-0 rounded-md bg-primary/10 relative overflow-hidden flex items-center justify-center">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img 
                              src={info.imageUrl} 
                              alt={info.nameJa} 
                              className="object-cover w-full h-full rounded-sm absolute inset-0 z-10" 
                              onError={(e) => { e.currentTarget.src = 'https://cdn.brawlify.com/brawler/shelly.png'; }}
                            />
                            <User className="w-4 h-4 text-primary/40" />
                          </div>
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
                          <div className="w-8 h-8 sm:w-10 sm:h-10 border-2 border-black/20 dark:border-white/10 transition-colors shrink-0 rounded-md bg-primary/10 relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={info.imageUrl} alt={info.nameJa} className="object-cover w-full h-full rounded-sm absolute inset-0 z-10" />
                          </div>
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
