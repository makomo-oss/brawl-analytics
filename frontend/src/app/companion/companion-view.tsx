"use client"

import { fetchPublicStats, getCachedPublicStats } from "@/lib/public-stats-cache"
import { draftDataUrls, cachedDraftDetails, fetchDraftBase, fetchDraftDetails, prefetchDraftData } from "@/lib/draft-data"

import { useBrawlerCatalog } from "@/lib/use-brawler-catalog"
import { useState, useEffect, useMemo, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { translateMode, translateMap, getModeIconUrl } from "@/lib/translations"
import { getBrawlerInfo, BRAWLER_MAP } from "@/lib/brawlers"
import { Swords, Ban, Check, RefreshCw, Trophy, Target, User, Search, X } from "lucide-react"
import { API_URL } from "@/lib/config"
import Link from "@/components/document-link"
import { conditionPath } from "@/lib/condition-pages"
import { isDraftCategories, type DraftCategories } from "@/lib/draft-categories"

function toKatakana(str: string): string {
  return str.replace(/[\u3041-\u3096]/g, match =>
    String.fromCharCode(match.charCodeAt(0) + 0x60)
  );
}

function toHiragana(str: string): string {
  return str.replace(/[\u30A1-\u30F6]/g, match =>
    String.fromCharCode(match.charCodeAt(0) - 0x60)
  );
}

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

export default function DraftCompanionPage({ initialCategories }: { initialCategories: DraftCategories }) {
  const catalogRevision = useBrawlerCatalog()
  const [phase, setPhase] = useState<Phase>("setup")
  const [categories, setCategories] = useState(initialCategories)

  // Setup State
  const [selectedMode, setSelectedMode] = useState(initialCategories.modes[0])
  const [selectedMap, setSelectedMap] = useState(initialCategories.mode_to_maps[initialCategories.modes[0]][0])
  const [myTeam, setMyTeam] = useState<Team>("blue")
  const [firstPickTeam, setFirstPickTeam] = useState<Team>("blue")

  // Draft State
  const [allyBans, setAllyBans] = useState<string[]>([])
  const [enemyBans, setEnemyBans] = useState<string[]>([])
  const [bluePicks, setBluePicks] = useState<string[]>([])
  const [redPicks, setRedPicks] = useState<string[]>([])

  // Character Search State
  const [charSearchQuery, setCharSearchQuery] = useState("")

  // Data State
  const [metaData, setMetaData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [detailsReady, setDetailsReady] = useState(false)
  const [detailsError, setDetailsError] = useState("")
  const draftRequestRef = useRef(0)

  useEffect(() => {
    // Activity pauses effects while another tab is visible. Resume a pending
    // details request, or release a setup request cancelled while hidden.
    if (phase === "setup") setLoading(false)
    else if (!detailsReady) void retryDraftDetails()
    return () => { ++draftRequestRef.current }
  }, [])

  // Server choices remain usable when background revalidation fails.
  useEffect(() => {
    let active = true
    void fetchPublicStats<unknown>(`${API_URL}/meta/categories?type=gachi`).then(data => {
      if (active && isDraftCategories(data)) setCategories(data)
    }).catch(() => { /* Keep the last normal choices instead of an error-only page. */ })
    return () => { active = false }
  }, [])

  // 選択されたモードに属するマップを計算
  const availableMaps = useMemo(() => {
    if (!selectedMode) return categories.maps
    return categories.mode_to_maps[selectedMode] ?? []
  }, [selectedMode, categories])

  // モードが変わった時に、選択中マップが含まれていなければ自動補正する
  useEffect(() => {
    if (phase !== "setup") return
    if (!categories.modes.includes(selectedMode)) setSelectedMode(categories.modes[0])
    if (availableMaps.length === 0) setSelectedMap("")
    else if (availableMaps.length > 0 && (!selectedMap || !availableMaps.includes(selectedMap))) {
      setSelectedMap(availableMaps[0])
    }
  }, [availableMaps, selectedMap, categories, selectedMode, phase])

  useEffect(() => {
    if (phase !== "setup" || !selectedMode || !selectedMap || !availableMaps.includes(selectedMap)) return
    const timer = setTimeout(() => prefetchDraftData(draftDataUrls(API_URL, selectedMode, selectedMap)), 150)
    return () => clearTimeout(timer)
  }, [phase, selectedMode, selectedMap, availableMaps])

  // 検索クエリに基づきキャラクターを高速フィルタリング (ひらがな・カタカナ・英語・ローマ字対応)
  const filteredBrawlers = useMemo(() => {
    const allChars = Object.keys(BRAWLER_MAP)
    const q = charSearchQuery.trim().toLowerCase()
    if (!q) return allChars

    const qKata = toKatakana(q)
    const qHira = toHiragana(q)

    return allChars.filter(charKey => {
      const info = getBrawlerInfo(charKey)
      const nameEn = charKey.toLowerCase()
      const nameJa = info.nameJa.toLowerCase()
      const nameJaKata = toKatakana(nameJa)
      const nameJaHira = toHiragana(nameJa)

      return (
        nameEn.includes(q) ||
        nameJa.includes(q) ||
        nameJaKata.includes(qKata) ||
        nameJaHira.includes(qHira) ||
        charKey.toLowerCase().includes(q)
      )
    })
  }, [charSearchQuery, catalogRevision])

  const dataErrorMessage = (err: unknown) => err instanceof TypeError
    ? "通信に失敗しました。時間をおいて再試行してください。"
    : err instanceof Error && (err.message.startsWith("Statistics API") || err.name === "TimeoutError")
      ? "データを取得できませんでした。時間をおいて再試行してください。"
    : err instanceof Error ? err.message : "データを取得できませんでした"

  // BAN needs map scores only. Load Pick's pair matrix in the background.
  const handleStartDraft = async () => {
    const requestId = ++draftRequestRef.current
    const urls = draftDataUrls(API_URL, selectedMode, selectedMap)
    setLoading(true)
    setError("")
    setDetailsError("")
    setDetailsReady(false)
    const ready = cachedDraftDetails(urls)
    // Attach both handlers immediately, including when the base request fails.
    const details = ready ? Promise.resolve({ data: ready, error: null })
      : fetchDraftDetails(urls).then(data => ({ data, error: null }), error => ({ data: null, error }))
    try {
      const data = ready || getCachedPublicStats(urls.base) || await fetchDraftBase(urls)
      if (requestId !== draftRequestRef.current) return
      if (!Object.keys(data.characters ?? {}).length) throw new Error("このマップのガチバトルデータが不足しています。別のマップを選択してください。")
      setMetaData(data)
      setDetailsReady(!!ready)
      setPhase("ban")
      void details.then(result => {
        if (requestId !== draftRequestRef.current) return
        if (result.error) setDetailsError(dataErrorMessage(result.error))
        else {
          setMetaData(result.data)
          setDetailsReady(true)
        }
      })
    } catch (err) {
      if (requestId === draftRequestRef.current) setError(dataErrorMessage(err))
    } finally {
      if (requestId === draftRequestRef.current) setLoading(false)
    }
  }

  const retryDraftDetails = async () => {
    const requestId = ++draftRequestRef.current
    setDetailsError("")
    try {
      const data = await fetchDraftDetails(draftDataUrls(API_URL, selectedMode, selectedMap))
      if (requestId !== draftRequestRef.current) return
      setMetaData(data)
      setDetailsReady(true)
    } catch (err) {
      if (requestId === draftRequestRef.current) setDetailsError(dataErrorMessage(err))
    }
  }

  const handleReset = () => {
    ++draftRequestRef.current
    setLoading(false)
    setError("")
    setDetailsReady(false)
    setDetailsError("")
    setPhase("setup")
    setAllyBans([])
    setEnemyBans([])
    setBluePicks([])
    setRedPicks([])
    setCharSearchQuery("")
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
    if (phase === "pick" && !detailsReady) return
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

  // キャラクターのメタ統計を正規化キーで安全に取得
  const getCharStats = (charId: string) => {
    if (!metaData?.characters) return null
    const norm = charId.toLowerCase().replace(/[\s_\-&.]/g, "")
    if (metaData.characters[charId]) return metaData.characters[charId]
    for (const [k, v] of Object.entries<any>(metaData.characters)) {
      if (k.toLowerCase().replace(/[\s_\-&.]/g, "") === norm) return v
    }
    return null
  }

  // 2キャラ間の直接対面勝率を取得 (双方向解決)
  const getMatchupWinRate = (myChar: string, enemyChar: string): number => {
    const myStats = getCharStats(myChar)
    const enemyStats = getCharStats(enemyChar)
    const normMy = myChar.toLowerCase().replace(/[\s_\-&.]/g, "")
    const normEnemy = enemyChar.toLowerCase().replace(/[\s_\-&.]/g, "")

    if (myStats?.matchups && typeof myStats.matchups[normEnemy] === "number") {
      return myStats.matchups[normEnemy]
    }
    if (enemyStats?.matchups && typeof enemyStats.matchups[normMy] === "number") {
      return 100.0 - enemyStats.matchups[normMy]
    }
    if (myStats?.kamo) {
      const k = myStats.kamo.find((item: any) => item.brawler.toLowerCase().replace(/[\s_\-&.]/g, "") === normEnemy)
      if (k) return k.win_rate
    }
    if (myStats?.tenteki) {
      const t = myStats.tenteki.find((item: any) => item.brawler.toLowerCase().replace(/[\s_\-&.]/g, "") === normEnemy)
      if (t) return t.win_rate
    }
    return 50.0
  }

  // 2キャラ間の味方ペア共起シナジー（リフト値）を取得 (双方向解決)
  const getPairSynergyLift = (myChar: string, allyChar: string): number => {
    const myStats = getCharStats(myChar)
    const allyStats = getCharStats(allyChar)
    const normMy = myChar.toLowerCase().replace(/[\s_\-&.]/g, "")
    const normAlly = allyChar.toLowerCase().replace(/[\s_\-&.]/g, "")

    if (myStats?.synergies && myStats.synergies[normAlly]?.lift !== undefined) {
      return myStats.synergies[normAlly].lift
    }
    if (allyStats?.synergies && allyStats.synergies[normMy]?.lift !== undefined) {
      return allyStats.synergies[normMy].lift
    }
    return 0.0
  }

  // サジェスト計算ロジック (4軸統合エンジン: マップ・モード・対面・味方シナジー)
  const suggestions = useMemo(() => {
    if (!metaData || !metaData.characters) return []
    if (phase === "pick" && !detailsReady) return []

    const chars = metaData.characters
    const results = []

    if (phase === "ban") {
      // おすすめBAN: マップ適性 (score) が高く、まだ除外されていないキャラ
      for (const [name, stats] of Object.entries<any>(chars)) {
        if (isExcluded(name) || stats.sample_sufficient === false) continue
        const sMap = stats.score ?? 50.0
        results.push({ name, score: sMap, reason: "マップTier高", type: "ban" })
      }
      results.sort((a, b) => b.score - a.score)
      return results.slice(0, 10)
    }

    if (phase === "pick") {
      const allyCount = allyPicks.length
      const enemyCount = enemyPicks.length

      // 盤面に応じた動的4軸ウェイトの決定 (合計は常に1.0)
      let W_map = 0.55
      let W_mode = 0.45
      let W_counter = 0.00
      let W_syn = 0.00

      if (enemyCount === 0 && allyCount === 1) {
        W_map = 0.40; W_mode = 0.25; W_counter = 0.00; W_syn = 0.35
      } else if (enemyCount === 0 && allyCount === 2) {
        W_map = 0.35; W_mode = 0.20; W_counter = 0.00; W_syn = 0.45
      } else if (enemyCount === 1 && allyCount === 0) {
        W_map = 0.35; W_mode = 0.20; W_counter = 0.45; W_syn = 0.00
      } else if (enemyCount === 1 && allyCount >= 1) {
        W_map = 0.30; W_mode = 0.20; W_counter = 0.30; W_syn = 0.20
      } else if (enemyCount === 2 && allyCount === 0) {
        W_map = 0.25; W_mode = 0.15; W_counter = 0.60; W_syn = 0.00
      } else if (enemyCount === 2 && allyCount >= 1) {
        W_map = 0.20; W_mode = 0.15; W_counter = 0.40; W_syn = 0.25
      } else if (enemyCount === 3 && allyCount >= 1) {
        W_map = 0.15; W_mode = 0.10; W_counter = 0.45; W_syn = 0.30
      }

      for (const [name, stats] of Object.entries<any>(chars)) {
        if (isExcluded(name) || stats.sample_sufficient === false) continue

        // 1. S_map (マップ適性: 50点基準)
        const S_map = stats.score ?? 50.0

        // 2. S_mode (モード適性: 50点基準)
        const S_mode = stats.mode_score ?? stats.score ?? 50.0

        // 3. S_counter (対面カウンター相性: 50点基準)
        let S_counter = 50.0
        let bestCounterName = ""
        let bestCounterWr = 50.0

        if (enemyCount > 0) {
          let totalCounterDiff = 0
          for (const enemy of enemyPicks) {
            const wr = getMatchupWinRate(name, enemy)
            const diff = wr - 50.0
            totalCounterDiff += diff
            if (wr > bestCounterWr) {
              bestCounterWr = wr
              bestCounterName = enemy
            }
          }
          S_counter = 50.0 + (totalCounterDiff / enemyCount) * 1.5
        }

        // 4. S_syn (味方ペア共起シナジー: 50点基準)
        let S_syn = 50.0
        let bestSynergyAlly = ""
        let bestSynergyLift = 0.0

        if (allyCount > 0) {
          let totalLift = 0
          for (const ally of allyPicks) {
            const lift = getPairSynergyLift(name, ally)
            totalLift += lift
            if (lift > bestSynergyLift) {
              bestSynergyLift = lift
              bestSynergyAlly = ally
            }
          }
          S_syn = 50.0 + (totalLift / allyCount) * 1.5
        }

        // 4軸スコアの合成
        const finalScore = (W_map * S_map) + (W_mode * S_mode) + (W_counter * S_counter) + (W_syn * S_syn)

        // スマート推薦理由バッジの動的生成（説得力特化・多重タグ）
        const badges: Array<{ label: string; type: "counter" | "synergy" | "map" | "mode" | "general" }> = []

        // 1. カウンターバッジ (敵への有利性)
        if (bestCounterName) {
          const enemyInfo = getBrawlerInfo(bestCounterName)
          if (bestCounterWr >= 64.0) {
            badges.push({ label: `🔥 ${enemyInfo.nameJa}を完封 (${bestCounterWr.toFixed(0)}%)`, type: "counter" })
          } else if (bestCounterWr >= 56.0) {
            badges.push({ label: `⚔️ ${enemyInfo.nameJa}に有利 (${bestCounterWr.toFixed(0)}%)`, type: "counter" })
          }
        }

        // 2. シナジーバッジ (味方との相乗効果)
        if (bestSynergyAlly) {
          const allyInfo = getBrawlerInfo(bestSynergyAlly)
          if (bestSynergyLift >= 5.0) {
            badges.push({ label: `⚡ ${allyInfo.nameJa}と黄金連携 (+${bestSynergyLift.toFixed(1)}%)`, type: "synergy" })
          } else if (bestSynergyLift >= 2.5) {
            badges.push({ label: `🤝 ${allyInfo.nameJa}と好相性 (+${bestSynergyLift.toFixed(1)}%)`, type: "synergy" })
          }
        }

        // 3. マップ & モード適性バッジ
        if (S_map >= 62.0) {
          badges.push({ label: "👑 マップS+ Tier", type: "map" })
        } else if (S_map >= 58.0) {
          badges.push({ label: "🗺️ マップ高適性", type: "map" })
        }

        if (S_mode >= 60.0 && S_mode > S_map) {
          badges.push({ label: `🎯 ${translateMode(selectedMode)}特化`, type: "mode" })
        }

        // デフォルトフォールバック
        if (badges.length === 0) {
          badges.push({ label: "安定ピック", type: "general" })
        }

        results.push({
          name,
          score: finalScore,
          badges,
          type: "pick",
          baseScore: S_map,
          modeScore: S_mode,
          counterScore: S_counter,
          synScore: S_syn,
          bestCounterWr,
          bestSynergyLift
        })
      }

      results.sort((a, b) => b.score - a.score)
      return results.slice(0, 10)
    }

    return []
  }, [phase, allyBans, enemyBans, bluePicks, redPicks, metaData, enemyPicks, allyPicks, selectedMode, detailsReady])

  // 4軸統合による高精度勝率予測計算 (詳細メトリクス付き)
  const predictionStats = useMemo(() => {
    const defaultStats = {
      winRate: 50,
      allyEnvAvg: 50.0,
      enemyEnvAvg: 50.0,
      matchupAdvantage: 0.0,
      allySynergyTotal: 0.0
    }
    if (phase !== "done" || !metaData || !metaData.characters) return defaultStats

    let allyEnvTotal = 0
    let enemyEnvTotal = 0

    allyPicks.forEach(c => {
      const stats = getCharStats(c)
      allyEnvTotal += (stats?.score ?? 50.0)
    })
    enemyPicks.forEach(c => {
      const stats = getCharStats(c)
      enemyEnvTotal += (stats?.score ?? 50.0)
    })

    const allyEnvAvg = allyEnvTotal / (allyPicks.length || 1)
    const enemyEnvAvg = enemyEnvTotal / (enemyPicks.length || 1)

    // 対面マトリクス (味方3 vs 敵3 = 9対面) の総合アドバンテージ
    let matchupAdvantage = 0
    allyPicks.forEach(a => {
      enemyPicks.forEach(e => {
        const wr = getMatchupWinRate(a, e)
        matchupAdvantage += (wr - 50.0)
      })
    })
    matchupAdvantage = matchupAdvantage / 9.0 // 1対面あたりの平均勝率乖離

    // 味方シナジー総和 vs 敵シナジー総和
    let allySynergyTotal = 0
    if (allyPicks.length >= 2) {
      allySynergyTotal += getPairSynergyLift(allyPicks[0], allyPicks[1])
      if (allyPicks.length >= 3) {
        allySynergyTotal += getPairSynergyLift(allyPicks[0], allyPicks[2])
        allySynergyTotal += getPairSynergyLift(allyPicks[1], allyPicks[2])
      }
    }

    let enemySynergyTotal = 0
    if (enemyPicks.length >= 2) {
      enemySynergyTotal += getPairSynergyLift(enemyPicks[0], enemyPicks[1])
      if (enemyPicks.length >= 3) {
        enemySynergyTotal += getPairSynergyLift(enemyPicks[0], enemyPicks[2])
        enemySynergyTotal += getPairSynergyLift(enemyPicks[1], enemyPicks[2])
      }
    }

    // 環境適性の差分 (40%) + 対面相性アドバンテージ (40%) + チームシナジー差分 (20%)
    const envDiff = allyEnvTotal - enemyEnvTotal
    const synDiff = allySynergyTotal - enemySynergyTotal
    const totalAdvantage = (envDiff * 0.40) + (matchupAdvantage * 1.5 * 0.40) + (synDiff * 1.2 * 0.20)

    // シグモイド関数で勝率に変換
    const p = 1 / (1 + Math.exp(-0.15 * totalAdvantage))
    const winRate = Math.min(Math.max(Math.round(p * 100), 5), 95)

    return {
      winRate,
      allyEnvAvg,
      enemyEnvAvg,
      matchupAdvantage,
      allySynergyTotal
    }
  }, [phase, allyPicks, enemyPicks, metaData])

  // ================= UI Components =================

  if (phase === "setup") {
    return (
      <div className="arena-workspace arena-draft arena-draft-setup max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            ブロスタ ガチバトルのピック支援
          </h1>
          <p className="text-muted-foreground">
            マップ適性と敵の編成から、リアルタイムで最適なキャラクターを弾き出します。
          </p>
        </div>

        <Card className="border-primary/20 shadow-lg">
          <CardHeader>
            <CardTitle>ドラフト初期設定</CardTitle>
            <CardDescription>現在の試合環境を入力してください。</CardDescription>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <label id="draft-mode-label" className="text-sm font-bold">モード</label>
                <Select disabled={loading} value={selectedMode} onValueChange={(val) => setSelectedMode(val || "")}>
                  <SelectTrigger aria-labelledby="draft-mode-label" className="bg-secondary/50">
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
                <label id="draft-map-label" className="text-sm font-bold">マップ</label>
                <Select disabled={loading} value={selectedMap} onValueChange={(val) => setSelectedMap(val || "")}>
                  <SelectTrigger aria-labelledby="draft-map-label" className="bg-secondary/50">
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
        <nav aria-label="モード・マップのランキング" className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
          <Link href="/modes" className="hover:text-primary">モード一覧</Link>
          <Link href="/maps" className="hover:text-primary">マップ一覧</Link>
          {conditionPath("modes", selectedMode) && <Link href={conditionPath("modes", selectedMode)!} className="hover:text-primary">{translateMode(selectedMode)}のランキング</Link>}
        </nav>
      </div>
    )
  }

  return (
    <div className="arena-workspace arena-draft arena-draft-board max-w-7xl mx-auto space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-secondary/30 p-4 rounded-xl border border-primary/10">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            {phase === "ban" && <><Ban className="w-6 h-6 text-red-500" /> BANフェーズ</>}
            {phase === "pick" && <><Swords className="w-6 h-6 text-primary" /> Pickフェーズ</>}
            {phase === "done" && <><Check className="w-6 h-6 text-green-500" /> ドラフト完了</>}
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground flex flex-wrap items-center gap-1.5 sm:gap-2 mt-1">
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
            <CardContent className="pt-4 grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-6">

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
                          <span className="text-muted-foreground text-[10px] sm:text-sm mx-auto">選択 {i+1}</span>
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
                          <span className="text-muted-foreground text-[10px] sm:text-sm mx-auto">選択 {i+1}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Bans Area */}
              <div className="space-y-3 col-span-2 md:col-span-1">
                <h3 className="font-bold text-slate-500 flex flex-col items-center justify-center bg-slate-500/10 p-1 sm:p-2 rounded-lg text-[10px] sm:text-base leading-tight">
                  <span className="flex items-center gap-1"><Ban className="w-3 h-3 sm:w-4 sm:h-4" /> BAN指定</span>
                  <span className="font-normal opacity-0">.</span>
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-1 md:gap-4 gap-4">
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
                  <h2 className="text-2xl font-bold">編成有利度（参考値）</h2>
                </div>
                <div className="relative">
                  <svg className="w-48 h-48 transform -rotate-90">
                    <circle cx="96" cy="96" r="80" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-muted/20" />
                    <circle
                      cx="96" cy="96" r="80" stroke="currentColor" strokeWidth="12" fill="transparent"
                      strokeDasharray="502"
                      strokeDashoffset={502 - (502 * predictionStats.winRate) / 100}
                      className={predictionStats.winRate >= 50 ? "text-blue-500 transition-all duration-1000 ease-out" : "text-red-500 transition-all duration-1000 ease-out"}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-5xl font-extrabold">{predictionStats.winRate}%</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 w-full max-w-md bg-secondary/30 p-3 rounded-lg border border-primary/10 text-center">
                  <div className="space-y-1">
                    <div className="text-[10px] text-muted-foreground font-medium">マップ適性</div>
                    <div className="text-xs font-bold text-foreground">
                      {predictionStats.allyEnvAvg.toFixed(1)} vs {predictionStats.enemyEnvAvg.toFixed(1)}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[10px] text-muted-foreground font-medium">対面相性優位</div>
                    <div className={`text-xs font-bold ${predictionStats.matchupAdvantage >= 0 ? 'text-blue-500' : 'text-red-500'}`}>
                      {predictionStats.matchupAdvantage >= 0 ? `+${(predictionStats.matchupAdvantage * 100 / 50).toFixed(1)}%` : `${(predictionStats.matchupAdvantage * 100 / 50).toFixed(1)}%`}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[10px] text-muted-foreground font-medium">味方シナジー</div>
                    <div className={`text-xs font-bold ${predictionStats.allySynergyTotal >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {predictionStats.allySynergyTotal >= 0 ? `+${predictionStats.allySynergyTotal.toFixed(1)}%` : `${predictionStats.allySynergyTotal.toFixed(1)}%`}
                    </div>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground text-center max-w-[340px]">
                  集計スコアから算出した参考指標です。実際の勝率を保証するものではありません。対面・味方相性も選択したマップ・モードの集計を使用し、少数例は補正しています。
                </p>
                <Button className="mt-2" size="lg" onClick={handleReset}>
                  <RefreshCw className="w-4 h-4 mr-2" /> 新しいドラフトを始める
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Character Pool */}
          {phase !== "done" && (
            <Card className="border-primary/20 shadow-md">
              <CardHeader className="py-3 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b bg-secondary/10">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm font-bold text-foreground">キャラクター選択</CardTitle>
                  <Badge variant="secondary" className="text-xs font-mono h-5 px-1.5">
                    {filteredBrawlers.length} / {Object.keys(BRAWLER_MAP).length}
                  </Badge>
                </div>

                {/* リアルタイム高速検索バー */}
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="キャラ名検索 (ひらがな/英語)..."
                    value={charSearchQuery}
                    onChange={(e) => setCharSearchQuery(e.target.value)}
                    className="h-8 pl-8 pr-8 text-xs bg-background/80 focus-visible:ring-1"
                  />
                  {charSearchQuery && (
                    <button
                      onClick={() => setCharSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-4">
                <ScrollArea className="h-64 pr-3">
                  {filteredBrawlers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
                      <Search className="w-8 h-8 opacity-40" />
                      <p className="text-sm">「{charSearchQuery}」に一致するキャラクターは見つかりませんでした</p>
                      <Button variant="ghost" size="sm" onClick={() => setCharSearchQuery("")} className="text-xs">
                        検索をクリア
                      </Button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2 sm:gap-3">
                      {filteredBrawlers.map(charName => {
                        const info = getBrawlerInfo(charName)
                        const excluded = isExcluded(charName)
                        return (
                          <button type="button" disabled={excluded || (phase === "pick" && !detailsReady)} aria-label={info.nameJa}
                            key={charName}
                            onClick={() => !excluded && handleSelectCharacter(charName)}
                            className={`flex flex-col items-center justify-center min-h-[44px] min-w-[44px] gap-1 cursor-pointer transition-all hover:scale-105 group ${excluded ? 'opacity-20 cursor-not-allowed grayscale' : ''}`}
                            title={info.nameJa}
                          >
                            <div className="w-9 h-9 sm:w-12 sm:h-12 border-2 border-black/20 dark:border-white/10 group-hover:border-primary transition-colors shrink-0 rounded-md bg-primary/10 relative overflow-hidden flex items-center justify-center shadow-sm">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={info.imageUrl}
                                alt={info.nameJa}
                                className="object-cover w-full h-full rounded-sm absolute inset-0 z-10"
                                onError={(e) => { e.currentTarget.src = 'https://cdn.brawlify.com/brawler/shelly.png'; }}
                              />
                              <User className="w-4 h-4 text-primary/40" />
                            </div>
                            <span className="text-[10px] font-medium truncate w-full text-center group-hover:text-primary transition-colors">
                              {info.nameJa}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )}
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
              ) : phase === "pick" && !detailsReady ? (
                <div className="p-4 text-sm text-muted-foreground" role="status">
                  {detailsError ? <>
                    <p role="alert" className="text-destructive">{detailsError}</p>
                    <Button variant="outline" size="sm" className="mt-3" onClick={retryDraftDetails}>再試行</Button>
                  </> : "データ読み込み中..."}
                </div>
              ) : (
                <ScrollArea className="h-[400px] lg:h-[600px] px-4">
                  <div className="space-y-3 pb-4">
                    {suggestions.length === 0 && <p className="p-4 text-sm text-muted-foreground">この条件で推薦できる十分なデータがありません。キャラクターは手動で選択できます。</p>}
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
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="font-bold text-sm truncate flex items-center gap-2">
                              <span>{info.nameJa}</span>
                            </div>

                            {/* スマート推薦タグ群 */}
                            <div className="flex flex-wrap items-center gap-1.5">
                              {sug.badges ? (
                                sug.badges.map((b: any, bIdx: number) => {
                                  let badgeStyle = "bg-secondary text-secondary-foreground border-border"
                                  if (b.type === "counter") badgeStyle = "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30"
                                  else if (b.type === "synergy") badgeStyle = "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                                  else if (b.type === "map") badgeStyle = "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30"
                                  else if (b.type === "mode") badgeStyle = "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30"

                                  return (
                                    <span
                                      key={bIdx}
                                      className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded font-medium border ${badgeStyle}`}
                                    >
                                      {b.label}
                                    </span>
                                  )
                                })
                              ) : (
                                <span className="text-xs text-primary font-medium truncate">{sug.reason}</span>
                              )}
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <Badge variant={phase === "ban" ? "destructive" : "default"} className="font-mono text-xs shadow-sm">
                              {sug.score.toFixed(1)}点
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
