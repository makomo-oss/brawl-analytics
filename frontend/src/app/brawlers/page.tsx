import { getBrawlerEntries } from "@/lib/server-brawler-pages"
import { pageMetadata } from "@/lib/seo"
import BrawlerDirectoryView from "./brawler-directory-view"

export const metadata = pageMetadata("ブロスタ キャラ一覧・勝率と相性", "ブロスタのキャラ別Tier・勝率・使用率・おすすめマップ・敵味方との相性を対戦データで確認。各キャラの分析ページを一覧から探せます。", "/brawlers")

export default async function Page() {
  return <BrawlerDirectoryView entries={await getBrawlerEntries()} />
}
