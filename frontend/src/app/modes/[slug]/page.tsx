import { ConditionPage, conditionMetadata, conditionParams } from "@/lib/server-condition-pages"
export const dynamicParams = false
export const generateStaticParams = () => conditionParams("modes")
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) { return conditionMetadata("modes", (await params).slug) }
export default async function Page({ params }: { params: Promise<{ slug: string }> }) { return <ConditionPage kind="modes" slug={(await params).slug} /> }
