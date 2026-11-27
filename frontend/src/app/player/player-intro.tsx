import { FaqSection } from "@/components/faq-section"
import { PLAYER_FAQ } from "@/lib/faq"

// Shared by the Next layout and the Worker so /player stays one static shell:
// no query values or player data here.
export function PlayerHeader() {
  return <header className="mb-3 sm:mb-6 space-y-1 sm:space-y-2">
    <div className="arena-player-eyebrow">PLAYER &amp; CLUB ANALYTICS</div>
    <h1 className="text-xl sm:text-4xl font-extrabold tracking-tight">ブロスタ戦績検索・勝率確認</h1>
    <p className="text-xs sm:text-sm text-muted-foreground">プレイヤータグ・名前・クラブから戦績と勝率をリアルタイム分析します。</p>
  </header>
}

export function PlayerFaq() {
  return <div className="mt-10 space-y-6">
    <section aria-labelledby="player-guide-title" className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-6 space-y-3">
      <h2 id="player-guide-title" className="font-bold text-lg">ブロスタ戦績の見方・確認できる項目</h2>
      <p className="text-sm leading-relaxed text-muted-foreground">
        登録不要・無料で、プレイヤー名またはプレイヤータグ（#から始まる英数字）を入力するだけで最新の戦績を確認できます。
      </p>
      <ul className="text-sm leading-relaxed text-muted-foreground list-disc pl-5 space-y-1.5">
        <li><strong className="text-zinc-200">プロフィール・ランク</strong>：現在トロフィー、最高トロフィー、ガチバトルの現在・最高ランク、所属クラブ</li>
        <li><strong className="text-zinc-200">勝率・期間別分析</strong>：直近バトル履歴と、同期済みデータからの直近7・30・60日のキャラ別・モード別・マップ別勝率（全体平均との差も比較）</li>
        <li><strong className="text-zinc-200">クラブ検索・自動同期</strong>：クラブメンバーの一覧比較や、戦績を自動で蓄積する自動同期に対応</li>
      </ul>
    </section>
    <FaqSection id="faq-player" items={PLAYER_FAQ} />
  </div>
}
