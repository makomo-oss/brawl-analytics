import { ConditionDirectory } from "@/lib/server-condition-pages"
import { pageMetadata } from "@/lib/seo"
export const metadata = pageMetadata("ブロスタ モード別最強キャラランキング", "モード別のキャラ勝率・使用率ランキング。", "/modes")
export default function Page() { return <ConditionDirectory kind="modes" /> }
