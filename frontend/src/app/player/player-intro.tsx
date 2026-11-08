import { FaqSection } from "@/components/faq-section"
import { PLAYER_FAQ } from "@/lib/faq"

// Shared by the Next layout and the Worker so /player stays one static shell:
// no query values or player data here.
export function PlayerHeader() {
  return <header className="mb-8 space-y-2">
    <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">ブロスタ戦績検索・勝率確認</h1>
  </header>
}

export function PlayerFaq() {
  return <div className="mt-10"><FaqSection id="faq-player" items={PLAYER_FAQ} /></div>
}
