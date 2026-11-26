import { notFound } from "next/navigation"
import { pageMetadata, SITE_URL } from "@/lib/seo"
import { brawlerCopy } from "@/lib/page-copy"
import { getBrawlerEntries, getBrawlerPage } from "@/lib/server-brawler-pages"
import BrawlerDetailView from "../brawler-detail-view"
import { pageSchema } from "@/lib/llm-data"
import { brawlerFaq, faqNode } from "@/lib/faq"

export const dynamicParams = false

export async function generateStaticParams() {
  return (await getBrawlerEntries()).map(({ slug }) => ({ slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const data = await getBrawlerPage(slug)
  if (!data) notFound()
  const copy = brawlerCopy(data)
  const metadata = pageMetadata(copy.title, copy.description, `/brawlers/${slug}`)
  if (![data.cohorts.global, data.cohorts.gachi].some(cohort => cohort.stats?.sample_sufficient)) metadata.robots = { index: false, follow: true, googleBot: { index: false, follow: true } }
  return metadata
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const data = await getBrawlerPage(slug)
  if (!data) notFound()
  const jsonLd = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "ホーム", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "キャラ一覧", item: `${SITE_URL}/brawlers` },
      { "@type": "ListItem", position: 3, name: data.nameJa, item: `${SITE_URL}/brawlers/${slug}` },
    ],
  }
  const base = pageSchema({ kind: "detail", path: `/brawlers/${slug}`, data }, jsonLd)
  const faq = faqNode(`${SITE_URL}/brawlers/${slug}`, brawlerFaq(data))
  const structured = faq ? { ...base, "@graph": [...base["@graph"], faq] } : base
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, "\\u003c") }} />
    <BrawlerDetailView data={data} />
  </>
}
