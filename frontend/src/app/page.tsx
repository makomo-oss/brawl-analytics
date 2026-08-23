"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Trophy, Swords, ArrowRight, Sparkles, TrendingUp, TrendingDown, Clock, Shield, Cpu, Bot, User, Flame } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getBrawlerInfo } from "@/lib/brawlers";
import { API_URL } from "@/lib/config";
import { BurolaboIcon } from "@/components/brand-icon";

interface RecentSearch {
  tag: string;
  name?: string;
}

export default function CockpitHomePage() {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState("");
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [tierData, setTierData] = useState<any>(null);
  const [loadingTier, setLoadingTier] = useState(true);
  
  // モーダル用ステート
  const [selectedChar, setSelectedChar] = useState<any>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);

  // 検索サジェスト用
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // 1. 最近の検索履歴を localStorage から読み込み
  useEffect(() => {
    try {
      const saved = localStorage.getItem("burolabo_recent_searches");
      if (saved) {
        setRecentSearches(JSON.parse(saved).slice(0, 4));
      }
    } catch {
      // ignore
    }
  }, []);

  // 2. 今日の環境速報 (ガチバトル S+ / S Tier) を取得
  useEffect(() => {
    const fetchTopMeta = async () => {
      try {
        const res = await fetch(`${API_URL}/meta/tier-list?type=gachi&rank_tier=all`);
        if (res.ok) {
          const data = await res.json();
          setTierData(data);
        }
      } catch (err) {
        console.error("Failed to load meta highlights", err);
      } finally {
        setLoadingTier(false);
      }
    };
    fetchTopMeta();
  }, []);

  // 3. サジェスト検索のデバウンス処理
  useEffect(() => {
    const trimmed = (searchInput || "").trim();
    if (!trimmed || trimmed.startsWith("#")) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/player/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal
        });
        if (res.ok) {
          const result = await res.json();
          if (Array.isArray(result) && result.length > 0) {
            setSuggestions(result);
            setShowSuggestions(true);
          } else {
            setSuggestions([]);
            setShowSuggestions(false);
          }
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setSuggestions([]);
          setShowSuggestions(false);
        }
      }
    }, 120);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [searchInput]);

  // 外部クリックでサジェストを閉じる
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 検索実行
  const handleSearch = (overrideTag?: string, overrideName?: string) => {
    const raw = (overrideTag || searchInput).trim();
    if (!raw) return;

    // タグ保存
    const cleanTag = raw.startsWith("#") ? raw : `#${raw}`;
    const urlTag = raw.replace(/^#/, "");

    // 履歴保存
    try {
      const updated = [
        { tag: cleanTag, name: overrideName || cleanTag },
        ...recentSearches.filter(s => s.tag.toUpperCase() !== cleanTag.toUpperCase())
      ].slice(0, 4);
      setRecentSearches(updated);
      localStorage.setItem("burolabo_recent_searches", JSON.stringify(updated));
    } catch {
      // ignore
    }

    router.push(`/player?tag=${encodeURIComponent(urlTag)}`);
  };

  // キャラクタークリック時（対面詳細モーダル）
  const handleCharClick = async (charName: string, tier: string) => {
    const baseInfo = tierData?.characters?.[charName] || {
      score: 50.0,
      win_rate: 50.0,
      use_rate: 0.0,
      total_matches: 0
    };

    setSelectedChar({
      id: charName,
      tier,
      ...baseInfo,
      kamo: [],
      tenteki: []
    });
    setSheetOpen(true);
    setModalLoading(true);

    try {
      const res = await fetch(`${API_URL}/meta/characters/${encodeURIComponent(charName)}?type=gachi&rank_tier=all`);
      if (res.ok) {
        const detail = await res.json();
        setSelectedChar((prev: any) => ({
          ...prev,
          ...detail,
          tier
        }));
      }
    } catch (err) {
      console.error("Failed to load character detail", err);
    } finally {
      setModalLoading(false);
    }
  };

  // トップメタキャラの抽出 (S+ および S)
  const topMetaChars: { id: string; tier: string; score: number; win_rate: number }[] = [];
  if (tierData?.tiers) {
    const spList = tierData.tiers["S+"] || [];
    const sList = tierData.tiers["S"] || [];
    
    spList.forEach((id: string) => {
      const c = tierData.characters?.[id];
      topMetaChars.push({ id, tier: "S+", score: c?.score || 0, win_rate: c?.win_rate || 50 });
    });
    sList.forEach((id: string) => {
      const c = tierData.characters?.[id];
      topMetaChars.push({ id, tier: "S", score: c?.score || 0, win_rate: c?.win_rate || 50 });
    });
  }

  return (
    <div className="flex flex-col gap-10 max-w-5xl mx-auto pb-12">
      
      {/* ========================================================================= */}
      {/* ① 最優先: プレイヤー検索 (ファーストビューの主役) */}
      {/* ========================================================================= */}
      <section className="flex flex-col items-center text-center pt-4 md:pt-8">
        <div className="flex items-center justify-center gap-2.5 mb-3">
          <BurolaboIcon size={36} className="shadow-lg" />
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
            ブロスタ戦績 & メタ分析
          </h1>
        </div>
        <p className="text-xs sm:text-sm text-zinc-400 max-w-md mb-6">
          タグを入力して、リアルタイムのガチバトル戦績やメタ適性を即時診断。
        </p>

        {/* 検索入力ボックス (大きく押しやすい主役UI) */}
        <div ref={searchContainerRef} className="relative w-full max-w-xl">
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch();
            }}
            className="relative flex items-center shadow-2xl rounded-2xl p-1 bg-gradient-to-r from-purple-500/30 via-cyan-500/30 to-purple-500/30 border border-white/15 backdrop-blur-xl transition-all duration-300 focus-within:border-primary/80 focus-within:shadow-[0_0_30px_rgba(168,85,247,0.35)]"
          >
            <div className="flex items-center pl-3.5 pointer-events-none text-zinc-400">
              <Search className="w-5 h-5" />
            </div>
            <Input
              type="text"
              placeholder="プレイヤータグ（例: #V99J0CCV8）または名前"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="flex-1 bg-transparent border-0 text-white placeholder:text-zinc-500 focus-visible:ring-0 focus-visible:ring-offset-0 text-sm sm:text-base px-3 py-3 h-12"
            />
            <Button
              type="submit"
              className="h-10 px-5 rounded-xl font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-all active:scale-95 shadow-md shrink-0"
            >
              分析する
            </Button>
          </form>

          {/* サジェストドロップダウン */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-900/95 border border-zinc-700/80 rounded-xl shadow-2xl backdrop-blur-md overflow-hidden z-50 text-left">
              <div className="p-2 border-b border-zinc-800 text-[11px] font-medium text-zinc-400">
                検索候補（プレイヤー名）
              </div>
              <div className="max-h-60 overflow-y-auto divide-y divide-zinc-800/60">
                {suggestions.map((p: any) => (
                  <button
                    key={p.tag}
                    type="button"
                    onClick={() => handleSearch(p.tag, p.name)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-zinc-800/70 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2.5">
                      <Avatar className="w-7 h-7 border border-zinc-700">
                        <AvatarImage src={`https://cdn.brawlify.com/profile-icons/regular/${p.icon_id || 28000000}.png`} />
                        <AvatarFallback>{p.name?.[0]}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-bold text-sm text-zinc-100">{p.name}</div>
                        <div className="text-[11px] text-zinc-400 font-mono">{p.tag}</div>
                      </div>
                    </div>
                    <div className="text-right text-xs">
                      <div className="font-bold text-amber-400">🏆 {p.trophies?.toLocaleString()}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 最近検索した履歴チップ (さりげなく配置) */}
        {recentSearches.length > 0 && (
          <div className="flex items-center gap-1.5 mt-3 flex-wrap justify-center text-xs text-zinc-400">
            <span className="flex items-center gap-1 text-zinc-500 font-medium">
              <Clock className="w-3.5 h-3.5" /> 履歴:
            </span>
            {recentSearches.map((item) => (
              <button
                key={item.tag}
                type="button"
                onClick={() => handleSearch(item.tag, item.name)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700/50 transition-colors"
              >
                <span className="font-medium">{item.name || item.tag}</span>
                <span className="text-[10px] text-zinc-500 font-mono">{item.tag}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* ② 優先度: 今日の環境速報 (S+ / S Tier) */}
      {/* ========================================================================= */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-rose-500" />
            <h2 className="text-lg font-bold text-zinc-100">
              今日のガチバトル環境速報 (Tier S+ / S)
            </h2>
          </div>
          <Link
            href="/tier"
            className="text-xs font-semibold text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
          >
            詳細Tier表を見る <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loadingTier ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-28 rounded-2xl bg-zinc-900/60 border border-zinc-800 animate-pulse" />
            ))}
          </div>
        ) : topMetaChars.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {topMetaChars.slice(0, 12).map((char) => {
              const info = getBrawlerInfo(char.id);
              const isSp = char.tier === "S+";
              return (
                <button
                  key={char.id}
                  type="button"
                  onClick={() => handleCharClick(char.id, char.tier)}
                  className={`group relative flex flex-col items-center p-3 rounded-2xl border backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:shadow-xl text-left ${
                    isSp 
                      ? "bg-purple-950/20 border-purple-500/40 hover:border-purple-400 hover:shadow-purple-500/20" 
                      : "bg-pink-950/20 border-pink-500/40 hover:border-pink-400 hover:shadow-pink-500/20"
                  }`}
                >
                  <div className="absolute top-2 left-2 z-10">
                    <Badge className={`text-[10px] font-black px-1.5 py-0.5 border-0 ${
                      isSp ? "bg-purple-600 text-white" : "bg-pink-600 text-white"
                    }`}>
                      {char.tier}
                    </Badge>
                  </div>

                  <div className="relative w-14 h-14 my-1 rounded-xl overflow-hidden shadow-md group-hover:scale-105 transition-transform">
                    <img
                      src={info.imageUrl}
                      alt={info.nameJa}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = "https://cdn.brawlify.com/brawler/shelly.png";
                      }}
                    />
                  </div>

                  <div className="w-full text-center">
                    <div className="text-xs font-bold text-zinc-200 truncate group-hover:text-white">
                      {info.nameJa}
                    </div>
                    <div className="text-[11px] font-semibold text-emerald-400 mt-0.5">
                      勝率 {char.win_rate}%
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="p-6 text-center text-sm text-zinc-500 bg-zinc-900/40 rounded-2xl border border-zinc-800">
            環境データを読み込み中...
          </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* ③ 優先度: クイックアクセス (控えめな補助カード) */}
      {/* ========================================================================= */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* BAN/Pick支援 */}
        <Link
          href="/companion"
          className="group flex items-center gap-4 p-4 rounded-2xl bg-zinc-900/40 hover:bg-zinc-900/80 border border-zinc-800/80 hover:border-purple-500/40 transition-all duration-300"
        >
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400 group-hover:scale-110 group-hover:bg-purple-500/20 transition-all shrink-0">
            <Cpu className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm text-zinc-100 group-hover:text-purple-300 transition-colors">
                ピック支援 (BAN/Pick)
              </h3>
              <Badge variant="outline" className="text-[10px] text-purple-400 border-purple-500/30">
                4軸エンジン
              </Badge>
            </div>
            <p className="text-xs text-zinc-400 truncate mt-0.5">
              味方シナジー・敵カウンター・マップ適性からリアルタイム予測
            </p>
          </div>
          <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-purple-400 group-hover:translate-x-1 transition-all shrink-0" />
        </Link>

        {/* AI 戦術コーチ */}
        <Link
          href="/ai-coach"
          className="group flex items-center gap-4 p-4 rounded-2xl bg-zinc-900/40 hover:bg-zinc-900/80 border border-zinc-800/80 hover:border-cyan-500/40 transition-all duration-300"
        >
          <div className="w-12 h-12 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-400 group-hover:scale-110 group-hover:bg-cyan-500/20 transition-all shrink-0">
            <Bot className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm text-zinc-100 group-hover:text-cyan-300 transition-colors">
                AI 専属戦術コーチ
              </h3>
              <Badge variant="outline" className="text-[10px] text-cyan-400 border-cyan-500/30">
                GPT-4o 駆動
              </Badge>
            </div>
            <p className="text-xs text-zinc-400 truncate mt-0.5">
              戦績ログからあなたのプレイスタイルの課題や改善点を診断
            </p>
          </div>
          <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-cyan-400 group-hover:translate-x-1 transition-all shrink-0" />
        </Link>
      </section>

      {/* ========================================================================= */}
      {/* キャラクター対面詳細モーダル (Sheet) */}
      {/* ========================================================================= */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col bg-zinc-950 border-zinc-800">
          {selectedChar && (
            <>
              <SheetHeader className="p-6 pb-4 border-b border-zinc-800 flex flex-row items-center gap-4">
                <Avatar className="w-16 h-16 rounded-xl border-2 border-primary/40 shadow-md">
                  <AvatarImage src={getBrawlerInfo(selectedChar.id).imageUrl} />
                  <AvatarFallback>{selectedChar.id}</AvatarFallback>
                </Avatar>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <SheetTitle className="text-xl font-black text-white">
                      {getBrawlerInfo(selectedChar.id).nameJa}
                    </SheetTitle>
                    <Badge className="bg-primary text-primary-foreground text-xs font-bold">
                      Tier {selectedChar.tier}
                    </Badge>
                  </div>
                  <SheetDescription className="text-xs text-zinc-400">
                    環境スコア: {selectedChar.score} / {selectedChar.total_matches?.toLocaleString()}試合
                  </SheetDescription>
                </div>
              </SheetHeader>

              <ScrollArea className="flex-1 p-6 space-y-6">
                {/* 3指標カード */}
                <div className="grid grid-cols-3 gap-2 mb-6">
                  <div className="bg-zinc-900/60 p-3 rounded-xl border border-zinc-800 text-center">
                    <div className="text-[10px] text-zinc-400">総合勝率</div>
                    <div className={`text-base font-black ${
                      selectedChar.win_rate >= 55 ? "text-emerald-400" : selectedChar.win_rate >= 50 ? "text-cyan-400" : "text-amber-400"
                    }`}>
                      {selectedChar.win_rate}%
                    </div>
                  </div>
                  <div className="bg-zinc-900/60 p-3 rounded-xl border border-zinc-800 text-center">
                    <div className="text-[10px] text-zinc-400">使用率</div>
                    <div className="text-base font-black text-primary">
                      {selectedChar.use_rate}%
                    </div>
                  </div>
                  <div className="bg-zinc-900/60 p-3 rounded-xl border border-zinc-800 text-center">
                    <div className="text-[10px] text-zinc-400">分析試合</div>
                    <div className="text-base font-black text-zinc-200">
                      {selectedChar.total_matches?.toLocaleString()}
                    </div>
                  </div>
                </div>

                {modalLoading ? (
                  <div className="space-y-3 py-6">
                    <div className="h-4 bg-zinc-800 rounded animate-pulse w-3/4" />
                    <div className="h-16 bg-zinc-900 rounded-xl animate-pulse" />
                    <div className="h-16 bg-zinc-900 rounded-xl animate-pulse" />
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* 有利対面 (カモ) */}
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 mb-2.5">
                        <TrendingUp className="w-4 h-4" /> 有利な対面 TOP5（カモ）
                      </div>
                      {selectedChar.kamo && selectedChar.kamo.length > 0 ? (
                        <div className="space-y-1.5">
                          {selectedChar.kamo.slice(0, 5).map((k: any) => {
                            const enemy = getBrawlerInfo(k.brawler);
                            return (
                              <div key={k.brawler} className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-950/20 border border-emerald-500/20">
                                <div className="flex items-center gap-2">
                                  <Avatar className="w-8 h-8 rounded-lg">
                                    <AvatarImage src={enemy.imageUrl} />
                                    <AvatarFallback>{k.brawler[0]}</AvatarFallback>
                                  </Avatar>
                                  <span className="text-xs font-bold text-zinc-200">{enemy.nameJa}</span>
                                </div>
                                <div className="text-right">
                                  <div className="text-xs font-bold text-emerald-400">{k.win_rate}%</div>
                                  <div className="text-[10px] text-zinc-500">{k.matches}戦</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-xs text-zinc-500 py-2">十分なサンプルデータがありません</div>
                      )}
                    </div>

                    {/* 不利対面 (天敵) */}
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-bold text-rose-400 mb-2.5">
                        <TrendingDown className="w-4 h-4" /> 不利な対面 TOP5（天敵）
                      </div>
                      {selectedChar.tenteki && selectedChar.tenteki.length > 0 ? (
                        <div className="space-y-1.5">
                          {selectedChar.tenteki.slice(0, 5).map((t: any) => {
                            const enemy = getBrawlerInfo(t.brawler);
                            return (
                              <div key={t.brawler} className="flex items-center justify-between p-2.5 rounded-xl bg-rose-950/20 border border-rose-500/20">
                                <div className="flex items-center gap-2">
                                  <Avatar className="w-8 h-8 rounded-lg">
                                    <AvatarImage src={enemy.imageUrl} />
                                    <AvatarFallback>{t.brawler[0]}</AvatarFallback>
                                  </Avatar>
                                  <span className="text-xs font-bold text-zinc-200">{enemy.nameJa}</span>
                                </div>
                                <div className="text-right">
                                  <div className="text-xs font-bold text-rose-400">{t.win_rate}%</div>
                                  <div className="text-[10px] text-zinc-500">{t.matches}戦</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-xs text-zinc-500 py-2">十分なサンプルデータがありません</div>
                      )}
                    </div>
                  </div>
                )}
              </ScrollArea>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
