"use client";

import { useBrawlerCatalog } from "@/lib/use-brawler-catalog"
import { useState, useEffect, useRef } from "react";
import Link from "@/components/document-link";
import { useRouter } from "next/navigation";
import { Search, Trophy, Swords, ArrowRight, Sparkles, TrendingUp, TrendingDown, Clock, Shield, Cpu, Bot, User, Flame, Users, AlertCircle, Loader2, BarChart3 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getBrawlerInfo, getRankImage } from "@/lib/brawlers";
import { API_URL } from "@/lib/config";
import { ArenaHeroStage, ArenaToolCards } from "@/components/arena-home-panels";
import type { TierListData } from "@/lib/tier-data";
import { brawlerPath } from "@/lib/brawler-paths";
import { BrawlerDirectoryLink } from "@/components/brawler-directory-link";
import { BrawlerPreviewLink } from "@/components/brawler-preview-link";

import { characterDetailUrl, initialMatchup, type InitialMatchups } from "@/lib/matchup-preview";
import { fetchPublicStats, getCachedPublicStats } from "@/lib/public-stats-cache";

interface RecentSearch {
  tag: string;
  name?: string;
}

export default function CockpitHomePage({ initialTierData, initialMatchups }: { initialTierData: TierListData; initialMatchups: InitialMatchups }) {
  useBrawlerCatalog()
  const router = useRouter();
  const [searchInput, setSearchInput] = useState("");
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [tierData, setTierData] = useState<any>(initialTierData);
  const [loadingTier, setLoadingTier] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // 複数候補モーダル用ステート
  const [candidates, setCandidates] = useState<any[]>([]);
  const [candidateModalOpen, setCandidateModalOpen] = useState(false);

  // キャラ対面詳細モーダル用ステート
  const [selectedChar, setSelectedChar] = useState<any>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);

  // サジェスト用
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // クライアントサイド・インメモリキャッシュ (0ms即時表示用)
  const metaCacheRef = useRef<any>(initialTierData);
  const detailRequestRef = useRef(0);

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

  // 2. 初期HTMLの環境速報を表示したまま、最新データを取得
  useEffect(() => {
    const fetchTopMeta = async () => {
      try {
        const data = await fetchPublicStats(`${API_URL}/meta/tier-list?type=gachi&rank_tier=all`);
        if (data) {
          metaCacheRef.current = data;
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

  // プレイヤー検索の実行
  const handleSearch = async (overrideTag?: string, overrideName?: string) => {
    setShowSuggestions(false);
    setSearchError(null);

    // 1. タグまたは候補が直接指定された場合
    if (overrideTag) {
      const cleanTag = overrideTag.startsWith("#") ? overrideTag : `#${overrideTag}`;
      const urlTag = overrideTag.replace(/^#/, "");

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

      setCandidateModalOpen(false);
      router.push(`/player?tag=${encodeURIComponent(urlTag)}`);
      return;
    }

    const raw = searchInput.trim();
    if (!raw) return;

    // 2. 入力が '#' から始まる場合は直接タグ検索
    if (raw.startsWith("#")) {
      const cleanTag = raw;
      const urlTag = raw.replace(/^#/, "");
      try {
        const updated = [
          { tag: cleanTag, name: cleanTag },
          ...recentSearches.filter(s => s.tag.toUpperCase() !== cleanTag.toUpperCase())
        ].slice(0, 4);
        setRecentSearches(updated);
        localStorage.setItem("burolabo_recent_searches", JSON.stringify(updated));
      } catch {}
      router.push(`/player?tag=${encodeURIComponent(urlTag)}`);
      return;
    }

    // 3. 名前またはタグ文字列の検索API問い合わせ
    setIsSearching(true);
    try {
      const res = await fetch(`${API_URL}/player/search?q=${encodeURIComponent(raw)}`);
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list) && list.length > 0) {
          if (list.length === 1) {
            // 候補が1件のみの場合は即座にそのプレイヤーへジャンプ
            const p = list[0];
            const pTag = p.player_tag || p.tag || raw;
            handleSearch(pTag, p.name);
            return;
          } else {
            // 複数件ヒットした場合は候補一覧モーダルを表示
            setCandidates(list);
            setCandidateModalOpen(true);
            setIsSearching(false);
            return;
          }
        }
      }

      // 候補が0件の場合: もし英数字3-15文字ならタグとして試行
      const isTagLike = /^[A-Za-z0-9]{3,15}$/.test(raw);
      if (isTagLike) {
        handleSearch(raw, `#${raw}`);
        return;
      }

      setSearchError(`「${raw}」に一致するプレイヤーが見つかりませんでした。プレイヤータグを直接入力してお試しください。`);
    } catch (err) {
      console.error("Search error", err);
      setSearchError("検索中にエラーが発生しました。");
    } finally {
      setIsSearching(false);
    }
  };

  // キャラクタークリック時（対面詳細モーダル・キャッシュ優先）
  const handleCharClick = async (charName: string, tier: string) => {
    const baseInfo = tierData?.characters?.[charName] || {
      score: 50.0,
      win_rate: 50.0,
      use_rate: 0.0,
      total_matches: 0
    };

    const requestId = ++detailRequestRef.current;
    const url = characterDetailUrl(API_URL, charName);
    const preview = getCachedPublicStats(url) || initialMatchup(initialMatchups, charName, "gachi");

    setSelectedChar({
      id: charName,
      tier,
      ...baseInfo,
      kamo: [],
      tenteki: [],
      ...preview
    });
    setSheetOpen(true);
    setModalLoading(!preview);

    try {
      const detail = await fetchPublicStats(url);
      if (requestId === detailRequestRef.current) {
        setSelectedChar({ id: charName, ...baseInfo, ...detail, tier });
      }
    } catch (err) {
      console.error("Failed to load character detail", err);
    } finally {
      if (requestId === detailRequestRef.current) setModalLoading(false);
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
    <div className="arena-home">

      {/* ========================================================================= */}
      {/* ① 最優先: プレイヤー検索 (ファーストビューの主役) */}
      {/* ========================================================================= */}
      <section className="arena-home-hero">
        <div className="arena-hero-copy">
        <p className="arena-home-kicker"><span aria-hidden="true">✦</span> ブロラボ / ブロスタ攻略・分析ツール</p>
        <h1 className="arena-home-title">勝ち筋、<br /><span>見つけた。</span></h1>
        <p className="arena-home-description">ひらめきに、データをプラス。<br />プレイヤー戦績検索・環境Tier表・BAN/Pick支援を無料で。</p>

        {/* 検索入力ボックス (大きく押しやすい主役UI) */}
        <div ref={searchContainerRef} className="arena-search-region">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch();
            }}
            className="arena-search-form"
          >
            <div className="arena-search-icon" aria-hidden="true">
              {isSearching ? <Loader2 className="w-5 h-5 animate-spin text-primary" /> : <Search className="w-5 h-5" />}
            </div>
            <Input
              type="text"
              placeholder="プレイヤータグまたは名前"
              aria-label="プレイヤータグまたは名前"
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setSearchError(null);
              }}
              className="arena-search-input"
            />
            <Button
              type="submit"
              disabled={isSearching}
              className="arena-search-button"
            >
              {isSearching ? "検索中..." : "分析する"}
            </Button>
          </form>

          {/* エラーアラート */}
          {searchError && (
            <div className="flex items-center gap-2 mt-2.5 px-4 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs text-left animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{searchError}</span>
            </div>
          )}

          {/* サジェストドロップダウン */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-900/95 border border-zinc-700/80 rounded-xl shadow-2xl backdrop-blur-md overflow-hidden z-50 text-left">
              <div className="p-2 border-b border-zinc-800 text-[11px] font-medium text-zinc-400 flex items-center justify-between">
                <span>検索候補（クリックで即時分析）</span>
                <span className="text-[10px] text-zinc-500">{suggestions.length}件</span>
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-zinc-800/60">
                {suggestions.map((p: any) => {
                  const pTag = p.player_tag || p.tag;
                  const rank = p.highest_ranked_rank > 0 ? getRankImage(p.highest_ranked_rank) : null;
                  return (
                    <button
                      key={pTag}
                      type="button"
                      onClick={() => handleSearch(pTag, p.name)}
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-zinc-800/70 transition-colors text-left group"
                    >
                      <div className="flex items-center gap-2.5">
                        <Avatar className="w-9 h-9 border border-zinc-700 shrink-0">
                          <AvatarImage src={`https://cdn.brawlify.com/profile-icons/regular/${p.icon_id || 28000000}.png`} />
                          <AvatarFallback>{p.name?.[0]}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="font-bold text-sm text-zinc-100 group-hover:text-primary transition-colors truncate">{p.name}</div>
                          <div className="text-[11px] text-zinc-400 font-mono">#{pTag.replace(/^#/, "")}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {rank && (
                          <div className="flex items-center gap-1 bg-zinc-800/80 px-2 py-0.5 rounded-full border border-zinc-700/60" title={`最高ランク: ${rank.name} ${rank.tier}`}>
                            <img src={rank.url} alt={rank.name} className="w-5 h-5 object-contain" />
                            <span className="text-[11px] font-bold text-zinc-300">{rank.tier}</span>
                          </div>
                        )}
                        <div className="text-right text-xs">
                          <div className="font-bold text-amber-400">🏆 {p.trophies?.toLocaleString()}</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 最近検索した履歴チップ */}
        {recentSearches.length > 0 && (
          <div className="arena-recent-searches">
            <span className="flex items-center gap-1 text-zinc-500 font-medium">
              <Clock className="w-3.5 h-3.5" /> 履歴:
            </span>
            {recentSearches.map((item) => (
              <button
                key={item.tag}
                type="button"
                onClick={() => handleSearch(item.tag, item.name)}
                className="inline-flex items-center gap-1 px-2.5 py-2 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700/50 transition-colors"
              >
                <span className="font-medium">{item.name || item.tag}</span>
                <span className="text-[10px] text-zinc-500 font-mono">{item.tag}</span>
              </button>
            ))}
          </div>
        )}
        </div>
        <ArenaHeroStage />
      </section>

      <ArenaToolCards />

      {/* ========================================================================= */}
      {/* プレイヤー名検索 複数候補選択モーダル (Sheet/Modal) */}
      {/* ========================================================================= */}
      <Sheet open={candidateModalOpen} onOpenChange={setCandidateModalOpen}>
        <SheetContent side="bottom" className="sm:max-w-lg mx-auto rounded-t-3xl max-h-[85vh] p-0 flex flex-col bg-zinc-950 border-zinc-800">
          <SheetHeader className="p-6 pb-3 border-b border-zinc-800 text-left">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              <SheetTitle className="text-lg font-bold text-white">
                プレイヤーの選択（{candidates.length}件の候補）
              </SheetTitle>
            </div>
            <SheetDescription className="text-xs text-zinc-400">
              「{searchInput}」に一致するプレイヤーが見つかりました。該当するプレイヤーを選択してください。
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-4 space-y-2 divide-y divide-zinc-800/50">
            {candidates.map((p: any) => {
              const pTag = p.player_tag || p.tag;
              const rank = p.highest_ranked_rank > 0 ? getRankImage(p.highest_ranked_rank) : null;
              return (
                <button
                  key={pTag}
                  type="button"
                  onClick={() => handleSearch(pTag, p.name)}
                  className="w-full pt-2 first:pt-0 p-3 flex items-center justify-between rounded-2xl hover:bg-zinc-900/90 border border-transparent hover:border-zinc-700 transition-all text-left group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="w-12 h-12 rounded-xl border border-zinc-700 shadow-md shrink-0">
                      <AvatarImage src={`https://cdn.brawlify.com/profile-icons/regular/${p.icon_id || 28000000}.png`} />
                      <AvatarFallback>{p.name?.[0]}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="font-bold text-base text-zinc-100 group-hover:text-primary transition-colors truncate">
                        {p.name}
                      </div>
                      <div className="text-xs text-zinc-400 font-mono">
                        #{pTag.replace(/^#/, "")}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {rank && (
                      <div className="flex items-center gap-1.5 bg-zinc-800/80 px-2.5 py-1 rounded-xl border border-zinc-700/60" title={`最高ランク: ${rank.name} ${rank.tier}`}>
                        <img src={rank.url} alt={rank.name} className="w-6 h-6 object-contain" />
                        <span className="text-xs font-bold text-zinc-200">{rank.tier}</span>
                      </div>
                    )}
                    <div className="text-right">
                      <div className="font-extrabold text-sm text-amber-400">
                        🏆 {p.trophies?.toLocaleString()}
                      </div>
                      {p.highest_trophies > 0 && (
                        <div className="text-[11px] text-zinc-500">
                          最高 {p.highest_trophies?.toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>

      {/* ========================================================================= */}
      {/* ② 優先度: 今日の環境速報 (S+ / S Tier) */}
      {/* ========================================================================= */}
      <section className="arena-home-meta" aria-labelledby="arena-meta-title">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-rose-500" />
            <h2 id="arena-meta-title" className="arena-section-title">
              今日のガチバトル環境速報 (Tier S+ / S)
            </h2>
          </div>
          <Link
            href="/tier"
            className="text-xs font-semibold text-primary hover:text-primary/80 flex items-center gap-1 transition-colors py-2 shrink-0"
          >
            詳細Tier表を見る <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loadingTier ? (
          <div className="arena-meta-grid">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-28 rounded-2xl bg-zinc-900/60 border border-zinc-800 animate-pulse" />
            ))}
          </div>
        ) : topMetaChars.length > 0 ? (
          <div className="arena-meta-grid">
            {topMetaChars.slice(0, 12).map((char) => {
              const info = getBrawlerInfo(char.id);
              const isSp = char.tier === "S+";
              return (
                <BrawlerPreviewLink name={info.nameJa}
                  key={char.id}
                  href={tierData?.characters?.[char.id]?.total_matches > 0 ? brawlerPath(char.id) : undefined}
                  onPreview={() => { void handleCharClick(char.id, char.tier) }}
                  onIntent={() => { if (!initialMatchup(initialMatchups, char.id, "gachi")) void fetchPublicStats(characterDetailUrl(API_URL, char.id)).catch(() => {}); }}
                  className={`arena-meta-card${isSp ? " is-top-tier" : ""}`}
                >
                  <div className="arena-meta-card-label">
                    <span>THE META LINEUP</span>
                    <Badge className="arena-meta-tier">
                      {char.tier}
                    </Badge>
                  </div>

                  <div className="arena-meta-portrait">
                    <img loading="lazy" decoding="async"
                      src={info.imageUrl}
                      alt={info.nameJa}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = "https://cdn.brawlify.com/brawler/shelly.png";
                      }}
                    />
                  </div>

                  <div className="arena-meta-copy">
                    <div className="arena-meta-name">
                      {info.nameJa}
                    </div>
                    <div className="arena-meta-win">
                      勝率 {char.win_rate}%
                    </div>
                  </div>
                </BrawlerPreviewLink>
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
      <section className="arena-directory-callout" aria-labelledby="arena-directory-title">
        <span className="arena-directory-icon"><Users aria-hidden="true" /></span>
        <div>
          <p className="arena-section-eyebrow">FIND YOUR NEXT MAIN</p>
          <h2 id="arena-directory-title">次の相棒を、見つけよう。</h2>
          <p>キャラごとの勝率や対面相性をチェック。気になるキャラから、分析を深めよう。</p>
        </div>
        <BrawlerDirectoryLink className="arena-directory-action">キャラ一覧を見る<ArrowRight aria-hidden="true" /></BrawlerDirectoryLink>
      </section>
      <footer className="arena-home-footer"><span>ブロラボ <small>BRAWL LAB</small></span><p>非公式ファンツール · PLAY SMART. HAVE FUN.</p></footer>

      {/* 既存のキャラクター対面詳細・データ取得を維持 */}
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
                  {tierData?.characters?.[selectedChar.id]?.total_matches > 0 && <a href={brawlerPath(selectedChar.id)} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    詳細ページを見る<ArrowRight className="w-3 h-3" />
                  </a>}
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
