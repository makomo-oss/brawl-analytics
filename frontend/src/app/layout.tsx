import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Inter } from "next/font/google";
import { MainNav } from "@/components/main-nav";
import { SiteFooter } from "@/components/site-footer";
import { SITE_URL, searchCopy } from "@/lib/seo";
import { siteNodes } from "@/lib/site-schema";

const inter = Inter({ subsets: ["latin"] });

/**
 * Next.js Metadata API による包括的 SEO 設定
 *
 * Why: Google / Bing 検索でアプリ名「ブロラボ」やゲーム関連キーワード
 * （ブロスタ Tier, ブロスタ 戦績, ブロスタ ピック など）で
 * 上位表示されるための on-page シグナルを網羅的に設定する。
 */
export const metadata: Metadata = {
  // ─── 基本メタ ───
  title: {
    default: `${searchCopy.home.title} | ブロラボ`,
    template: "%s | ブロラボ",
  },
  description: searchCopy.home.description,
  keywords: [
    "ブロラボ",
    "ブロスタ",
    "Brawl Stars",
    "ブロスタ 戦績",
    "ブロスタ Tier",
    "ブロスタ Tier表",
    "ブロスタ ピック",
    "ブロスタ BAN",
    "ブロスタ 勝率",
    "ブロスタ キャラランキング",
    "ブロスタ メタ",
    "ブロスタ 環境",
    "ブロスタ ガチバトル",
    "ブロスタ 分析",
    "ブロスタ ツール",
    "Brawl Stars tier list",
    "Brawl Stars meta",
    "Brawl Stars stats",
  ],
  applicationName: "ブロラボ",
  authors: [{ name: "ブロラボ開発チーム" }],
  creator: "ブロラボ",
  publisher: "ブロラボ",
  category: "games",

  // ─── 正規 URL ───
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: "/",
  },

  // ─── ロボット制御 ───
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },

  // ─── Open Graph (Facebook, Discord, LINE 等) ───
  openGraph: {
    type: "website",
    locale: "ja_JP",
    url: SITE_URL,
    siteName: "ブロラボ",
    title: `${searchCopy.home.title} | ブロラボ`,
    description: searchCopy.home.description,
    images: [
      {
        url: "/icon-512.png",
        width: 512,
        height: 512,
        alt: "ブロラボ - ブロスタ分析ツール",
      },
    ],
  },

  // ─── Twitter Card ───
  twitter: {
    card: "summary",
    title: `${searchCopy.home.title} | ブロラボ`,
    description: searchCopy.home.description,
    images: ["/icon-512.png"],
  },

  // ─── アイコン ───
  icons: {
    icon: [
      { url: "/icon.svg?v=5", type: "image/svg+xml" },
      { url: "/icon-192.png?v=5", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png?v=5", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png?v=5", sizes: "180x180", type: "image/png" },
    ],
  },

  // ─── その他 ───
  manifest: "/manifest.json",
};

/**
 * Next.js Viewport API によるモバイル表示最適化
 *
 * Why: iOS Safari のノッチ/セーフエリアや PWA 表示時のスケーリングを
 * 正しく制御するため、viewport を明示的にエクスポートする。
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#090e1d",
  colorScheme: "dark",
};

/** Stable site, publisher, app and game identities shared with live pages. */
function JsonLdStructuredData() {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@graph": siteNodes() }).replace(/</g, "\\u003c") }} />;
}
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="dark">
      <head>
        <meta name="google-adsense-account" content="ca-pub-3162408161627830" />
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3162408161627830"
          crossOrigin="anonymous"
        />
        <link rel="alternate" type="text/plain" title="LLMs.txt" href="/llms.txt" />
        <link rel="describedby" type="application/json" href="/data/index.json" />
        <link rel="describedby" type="application/ld+json" href="/data/catalog.jsonld" />
        <JsonLdStructuredData />
      </head>
      <body className={`${inter.className} min-h-screen bg-background text-foreground antialiased`}>
        <MainNav />
        <main id="main-content" tabIndex={-1} className="container mx-auto px-3 pt-2.5 pb-20 sm:px-6 sm:pt-6 sm:pb-24 lg:p-8 max-w-7xl">
          {children}
          <SiteFooter />
        </main>
      </body>
    </html>
  );
}
