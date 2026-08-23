import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "プレイヤー戦績検索 - メタギャップ診断・バトル履歴分析",
  description:
    "ブロスタ（Brawl Stars）プレイヤーの戦績をタグまたは名前で即時検索。ガチバトル勝率、メタギャップ診断、隠れ得意キャラ、モード別分析、バトル履歴を一括表示。",
  alternates: { canonical: "/player" },
  openGraph: {
    title: "ブロスタ戦績検索 | ブロラボ",
    description: "プレイヤータグを入力してガチバトル戦績・メタギャップ・バトル履歴を即時分析。",
    url: "/player",
  },
};

export default function PlayerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
