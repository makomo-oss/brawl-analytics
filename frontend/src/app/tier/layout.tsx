import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "環境Tier表 - ブロスタキャラ勝率ランキング",
  description:
    "ブロスタ（Brawl Stars）ガチバトルの最新環境Tier表。全キャラの勝率・使用率をS+〜Dランクで一覧。モード別・マップ別・ランク帯別フィルタ対応。カモ・天敵の対面マトリクスも確認できます。",
  alternates: { canonical: "/tier" },
  openGraph: {
    title: "ブロスタ環境Tier表 | ブロラボ",
    description: "ブロスタ全キャラの勝率・使用率をリアルタイムで分析。S+〜Dランクの環境Tier表。",
    url: "/tier",
  },
};

export default function TierLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
