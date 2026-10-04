import { notFound } from "next/navigation"
import { pageMetadata, SITE_URL } from "@/lib/seo"
import { getBrawlerEntries, getBrawlerPage } from "@/lib/server-brawler-pages"
import BrawlerDetailView from "../brawler-detail-view"

export const dynamicParams = false

export async function generateStaticParams() {
  return (await getBrawlerEntries()).map(({ slug }) => ({ slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const data = await getBrawlerPage(slug)
  if (!data) notFound()
  const metadata = pageMetadata(`ブロスタ ${data.nameJa}の勝率・相性・おすすめマップ`, `${data.nameJa}のTier・勝率・使用率を対戦データから分析。モード別の成績、おすすめマップ、有利・不利な敵キャラ、相性のよい味方を集計件数とともに確認できます。`, `/brawlers/${slug}`)
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
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    <BrawlerDetailView data={data} />
  </>
}
