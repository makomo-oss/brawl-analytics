import { ConditionDirectory, getConditionIndex } from "@/lib/server-condition-pages"
import { pageMetadata } from "@/lib/seo"
import { conditionHubCopy } from "@/lib/page-copy"
export async function generateMetadata() {
  const copy = conditionHubCopy("maps", await getConditionIndex())
  return pageMetadata(copy.title, copy.description, "/maps")
}
export default function Page() { return <ConditionDirectory kind="maps" /> }
