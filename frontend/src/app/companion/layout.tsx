import { pageMetadata } from "@/lib/seo";
import { FeatureGuide } from "@/components/feature-guide";

export const metadata = pageMetadata(
  "ブロスタピックツール・BAN/Pick支援",
  "ブロスタのガチバトルで使える無料ピックツール。モード・マップと両チームのBAN/PICKを入力し、マップ適性・味方シナジー・敵カウンターから候補を比較できます。",
  "/companion",
);

export default function CompanionLayout({ children }: { children: React.ReactNode }) {
  return <>{children}<FeatureGuide feature="companion" /></>;
}
