import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ピック支援 - BAN/Pick リアルタイム予測エンジン",
  description:
    "ブロスタ（Brawl Stars）ガチバトルのBAN/Pick支援ツール。マップ適性・モード適性・味方シナジー・敵カウンターの4軸から最適ピックをリアルタイム予測。ドラフトで差をつけよう。",
  alternates: { canonical: "/companion" },
  openGraph: {
    title: "ブロスタ BAN/Pick支援 | ブロラボ",
    description: "4軸リアルタイムエンジンでガチバトルの最適ピックを予測。ドラフトで差をつけよう。",
    url: "/companion",
  },
};

export default function CompanionLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
