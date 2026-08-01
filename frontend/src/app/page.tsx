import Link from "next/link";
import { ArrowRight, BarChart3, LineChart, Cpu, Trophy } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-zinc-50 dark:bg-[#0a0a0a] font-sans overflow-hidden">
      
      {/* Background Gradient Orbs */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/20 dark:bg-primary/10 blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-blue-500/20 dark:bg-blue-900/20 blur-[120px]" />
      </div>

      <main className="flex-1 w-full max-w-6xl mx-auto px-6 py-20 z-10">
        
        {/* Hero Section */}
        <section className="flex flex-col items-center text-center pt-16 pb-24 md:pt-24 md:pb-32">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/50 dark:bg-white/5 border border-black/5 dark:border-white/10 backdrop-blur-md mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse"></span>
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Brawl Analytics v1.0 公開中</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-500 dark:from-white dark:via-zinc-200 dark:to-zinc-500 mb-6 max-w-4xl animate-in fade-in slide-in-from-bottom-6 duration-1000">
            環境を制覇せよ。
            <br className="hidden md:block" />
            <span className="text-primary">勝率を最大限に高めよう。</span>
          </h1>
          
          <p className="text-lg md:text-xl text-zinc-600 dark:text-zinc-400 max-w-2xl mb-10 leading-relaxed animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-150">
            膨大な対戦データと統計駆動の解析ロジックが、あなたのブロスタライフを次のレベルへ。
            最強のメタを把握し、自分だけの最適な戦術を見つけ出そう。
          </p>
          
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto animate-in fade-in slide-in-from-bottom-10 duration-1000 delay-300">
            <Link 
              href="/tier-list"
              className="flex items-center justify-center gap-2 w-full sm:w-auto px-8 py-4 rounded-full bg-primary text-primary-foreground font-semibold text-lg transition-all hover:scale-105 hover:shadow-[0_0_30px_rgba(var(--primary),0.5)]"
            >
              <Trophy className="w-5 h-5" />
              環境Tier表を見る
            </Link>
            <Link 
              href="/dashboard"
              className="flex items-center justify-center gap-2 w-full sm:w-auto px-8 py-4 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white font-semibold text-lg transition-all hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 hover:scale-105"
            >
              自分の戦績を分析
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </section>

        {/* Features Grid */}
        <section className="py-16 md:py-24 border-t border-zinc-200 dark:border-zinc-800/50">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white mb-4">
              主要機能
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto">
              データ駆動型の分析ツールで、ライバルに差をつけるための3つのコア機能。
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
            
            {/* Feature 1 */}
            <Link href="/tier-list" className="group flex flex-col p-8 rounded-3xl bg-white/60 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-zinc-800/50 backdrop-blur-sm transition-all duration-300 hover:-translate-y-2 hover:shadow-xl dark:hover:bg-zinc-800/50 hover:border-primary/30">
              <div className="w-14 h-14 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <BarChart3 className="w-7 h-7 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-3">
                メタ分析Tier表
              </h3>
              <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed flex-1">
                数百万の試合データから導き出された最新の環境Tier表。マップごとの最適キャラや、有利・不利な対面（カモ・天敵）を一目で把握できます。
              </p>
              <div className="mt-6 flex items-center text-blue-600 dark:text-blue-400 font-medium group-hover:translate-x-2 transition-transform">
                Tier表を見る <ArrowRight className="ml-2 w-4 h-4" />
              </div>
            </Link>

            {/* Feature 2 */}
            <Link href="/dashboard" className="group flex flex-col p-8 rounded-3xl bg-white/60 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-zinc-800/50 backdrop-blur-sm transition-all duration-300 hover:-translate-y-2 hover:shadow-xl dark:hover:bg-zinc-800/50 hover:border-primary/30">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <LineChart className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-3">
                パーソナルダッシュボード
              </h3>
              <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed flex-1">
                自身のプレイスタイルやキャラクターごとの勝率を緻密に分析。成長の軌跡を可視化し、得意・不得意なマップを明らかにします。
              </p>
              <div className="mt-6 flex items-center text-primary font-medium group-hover:translate-x-2 transition-transform">
                ダッシュボードを見る <ArrowRight className="ml-2 w-4 h-4" />
              </div>
            </Link>

            {/* Feature 3 */}
            <Link href="/companion" className="group flex flex-col p-8 rounded-3xl bg-white/60 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-zinc-800/50 backdrop-blur-sm transition-all duration-300 hover:-translate-y-2 hover:shadow-xl dark:hover:bg-zinc-800/50 hover:border-primary/30">
              <div className="w-14 h-14 rounded-2xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Cpu className="w-7 h-7 text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-3">
                ドラフト支援 (BAN/Pick)
              </h3>
              <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed flex-1">
                データ駆動型のピック評価機能。マップ適性と敵の編成に対するカウンター性能からリアルタイムに最適キャラを提示します。
              </p>
              <div className="mt-6 flex items-center text-purple-600 dark:text-purple-400 font-medium group-hover:translate-x-2 transition-transform">
                ドラフト支援を試す <ArrowRight className="ml-2 w-4 h-4" />
              </div>
            </Link>

          </div>
        </section>

      </main>
      
      {/* Footer */}
      <footer className="py-8 text-center text-zinc-500 dark:text-zinc-600 border-t border-zinc-200 dark:border-zinc-900 z-10">
        <p>© 2026 Brawl Analytics. Supercellとは提携していません。</p>
      </footer>
    </div>
  );
}
