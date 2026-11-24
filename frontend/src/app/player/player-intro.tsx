import { FaqSection } from "@/components/faq-section"
import { PLAYER_FAQ } from "@/lib/faq"

// Shared by the Next layout and the Worker so /player stays one static shell:
// no query values or player data here.
export function PlayerHeader() {
  return <header className="mb-6 space-y-2">
    <div className="arena-player-eyebrow">PLAYER &amp; CLUB ANALYTICS</div>
    <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight">ブロスタ戦績検索・勝率確認</h1>
    <p className="text-sm text-muted-foreground">プレイヤータグ・名前・クラブから戦績と勝率をリアルタイム分析します。</p>
  </header>
}

export function PlayerFaq() {
  return <div className="mt-10"><FaqSection id="faq-player" items={PLAYER_FAQ} /></div>
}
