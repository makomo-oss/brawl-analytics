import { getBrawlerEntries } from "@/lib/server-brawler-pages"
import { pageMetadata, searchCopy } from "@/lib/seo"
import BrawlerDirectoryView from "./brawler-directory-view"
import { collectionSchema } from "@/lib/condition-pages"
import { pageSchema } from "@/lib/llm-data"

export const metadata = pageMetadata(searchCopy.brawlers.title, searchCopy.brawlers.description, "/brawlers")

export default async function Page() {
  const entries = await getBrawlerEntries()
  const schema = collectionSchema("/brawlers", searchCopy.brawlers.title, [{ name: "ホーム", path: "/" }, { name: "キャラ一覧", path: "/brawlers" }], entries.map(row => ({ name: row.nameJa, path: `/brawlers/${row.slug}` })))
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchema({ kind: "directory", path: "/brawlers", entries }, schema)).replace(/</g, "\\u003c") }} /><BrawlerDirectoryView entries={entries} /></>
}
