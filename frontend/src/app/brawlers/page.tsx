import { getBrawlerEntries } from "@/lib/server-brawler-pages"
import { pageMetadata, searchCopy } from "@/lib/seo"
import BrawlerDirectoryView from "./brawler-directory-view"

export const metadata = pageMetadata(searchCopy.brawlers.title, searchCopy.brawlers.description, "/brawlers")

export default async function Page() {
  return <BrawlerDirectoryView entries={await getBrawlerEntries()} />
}
