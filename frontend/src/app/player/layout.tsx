import { pageMetadata } from "@/lib/seo";
import { FeatureGuide } from "@/components/feature-guide";

export const metadata = pageMetadata(
  "ブロスタ戦績検索・勝率確認",
  "ブロスタの戦績をプレイヤータグ・名前で検索。ガチバトルの勝率、キャラ別・モード別の成績、バトル履歴を無料で確認できます。プレイヤータグの調べ方も解説。",
  "/player",
);

export default function PlayerLayout({ children }: { children: React.ReactNode }) {
  return <>
    <header className="mb-8 space-y-2">
      <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">ブロスタ戦績検索・勝率確認</h1>
      <p className="text-muted-foreground">プレイヤータグや名前から戦績を検索。キャラ別・モード別の成績とバトル履歴を確認できます。</p>
    </header>
    {children}
    <FeatureGuide feature="player" />
  </>;
}
