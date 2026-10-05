import { ConditionPage, conditionMetadata, conditionParams } from "@/lib/server-condition-pages"
export const dynamicParams = false
export const generateStaticParams = () => conditionParams("maps")
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) { return conditionMetadata("maps", (await params).slug) }
export default async function Page({ params }: { params: Promise<{ slug: string }> }) { return <ConditionPage kind="maps" slug={(await params).slug} /> }
