import { pageMetadata } from "@/lib/seo";
import { FeatureGuide } from "@/components/feature-guide";

export const metadata = pageMetadata(
  "ブロスタTier表・キャラ勝率ランキング",
  "ブロスタのキャラを勝率・使用率で比較する環境Tier表。全体・ガチバトル、モード別・マップ別・ランク帯別に絞り込み。観測件数と相性を確認してキャラ選びの参考に。",
  "/tier",
);

export default function TierLayout({ children }: { children: React.ReactNode }) {
  return <>{children}<FeatureGuide feature="tier" /></>;
}
