import { ConditionDirectory, getConditionIndex } from "@/lib/server-condition-pages"
import { pageMetadata } from "@/lib/seo"
import { conditionHubCopy } from "@/lib/page-copy"
export async function generateMetadata() {
  const copy = conditionHubCopy("modes", await getConditionIndex())
  return pageMetadata(copy.title, copy.description, "/modes")
}
export default function Page() { return <ConditionDirectory kind="modes" /> }
