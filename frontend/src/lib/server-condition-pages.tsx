import { cache } from "react"
import { notFound } from "next/navigation"
import { getSnapshot } from "./server-brawler-pages"
import { conditionIndex, conditionPage, conditionCopy, conditionSchema, conditionBreadcrumbs, collectionSchema } from "./condition-pages"
import { pageMetadata } from "./seo"
import { ConditionDetailView, ConditionDirectoryView } from "@/components/condition-pages"

export const getConditionIndex = cache(async () => conditionIndex(await getSnapshot()))
export const conditionParams = async (kind: "modes" | "maps") => (await getConditionIndex())[kind].map(({ slug }) => ({ slug }))
export async function conditionMetadata(kind: "modes" | "maps", slug: string) {
  const entry = (await getConditionIndex())[kind].find(row => row.slug === slug)
  if (!entry) return {}
  const copy = conditionCopy(entry)
  return pageMetadata(copy.title, copy.description, entry.path)
}
function JsonLd({ value }: { value: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(value).replace(/</g, "\\u003c") }} />
}
export async function ConditionPage({ kind, slug }: { kind: "modes" | "maps"; slug: string }) {
  const index = await getConditionIndex()
  const entry = index[kind].find(row => row.slug === slug)
  if (!entry) notFound()
  const data = conditionPage(await getSnapshot(), entry, index)
  return <><JsonLd value={conditionSchema(data)} /><ConditionDetailView data={data} /></>
}
export async function ConditionDirectory({ kind }: { kind: "modes" | "maps" }) {
  const index = await getConditionIndex()
  return <><JsonLd value={collectionSchema(`/${kind}`, kind === "modes" ? "モード別キャラランキング" : "マップ別キャラランキング", conditionBreadcrumbs(undefined, kind), index[kind].map(row => ({ name: row.label, path: row.path })))} /><ConditionDirectoryView index={index} kind={kind} /></>
}
