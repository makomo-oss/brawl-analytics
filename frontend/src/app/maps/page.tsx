import { ConditionDirectory } from "@/lib/server-condition-pages"
import { pageMetadata } from "@/lib/seo"
export const metadata = pageMetadata("ブロスタ マップ別最強キャラランキング", "マップ別のキャラ勝率・使用率ランキング。", "/maps")
export default function Page() { return <ConditionDirectory kind="maps" /> }
