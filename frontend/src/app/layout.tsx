import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Inter } from "next/font/google";
import { MainNav } from "@/components/main-nav";

const inter = Inter({ subsets: ["latin"] });

/** サイトの正規 URL（Cloudflare Pages のカスタムドメイン） */
const SITE_URL = "https://brawl-lab.sozai-hub.com";

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
    default: "ブロラボ | ブロスタ戦績・Tier表・ピック支援ツール",
    template: "%s | ブロラボ",
  },
  description:
    "ブロラボはブロスタ（Brawl Stars）のガチバトル戦績検索・環境Tier表・BAN/Pick支援を提供する無料分析ツール。プレイヤー戦績のメタギャップ診断、キャラ勝率ランキング、リアルタイム環境速報でガチバトルの勝率を上げよう。",
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
    title: "ブロラボ | ブロスタ戦績・Tier表・ピック支援ツール",
    description:
      "ブロスタのガチバトル戦績検索・環境Tier表・BAN/Pick支援を提供する無料分析ツール。プレイヤー検索、キャラ勝率ランキング、リアルタイム環境速報で勝率UP。",
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
    title: "ブロラボ | ブロスタ戦績・Tier表・ピック支援ツール",
    description:
      "ブロスタのガチバトル戦績検索・環境Tier表・BAN/Pick支援を提供する無料分析ツール。",
    images: ["/icon-512.png"],
  },

  // ─── アイコン ───
  icons: {
    icon: [
      { url: "/icon.svg?v=4", type: "image/svg+xml" },
      { url: "/icon-192.png?v=4", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png?v=4", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png?v=4", sizes: "180x180", type: "image/png" },
    ],
    shortcut: ["/favicon.ico?v=4"],
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
};

/**
 * JSON-LD 構造化データ (WebApplication + WebSite)
 *
 * Why: Google のリッチリザルトやナレッジパネルに
 * アプリ情報を正しく表示させるため。
 * WebSite の SearchAction は Google サイトリンク検索ボックスの候補になる。
 */
function JsonLdStructuredData() {
  const webAppSchema = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "ブロラボ",
    alternateName: ["Brawl Lab", "burolabo"],
    url: SITE_URL,
    description:
      "ブロスタ（Brawl Stars）のガチバトル戦績検索・環境Tier表・BAN/Pick支援を提供する無料ゲーム分析ツール",
    applicationCategory: "GameApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "JPY",
    },
    inLanguage: "ja",
    image: `${SITE_URL}/icon-512.png`,
  };

  const webSiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "ブロラボ",
    alternateName: "Brawl Lab",
    url: SITE_URL,
    description: "ブロスタ（Brawl Stars）ガチバトル分析ツール",
    inLanguage: "ja",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/player?tag={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webSiteSchema) }}
      />
    </>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="dark">
      <head>
        <link rel="icon" type="image/svg+xml" href="/icon.svg?v=4" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png?v=4" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png?v=4" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=4" />
        <link rel="shortcut icon" href="/favicon.ico?v=4" />
        <JsonLdStructuredData />
      </head>
      <body className={`${inter.className} min-h-screen bg-background text-foreground antialiased`}>
        <MainNav />
        <main className="container mx-auto px-3 py-4 sm:p-6 lg:p-8 max-w-7xl pb-24 lg:pb-8">
          {children}
        </main>
      </body>
    </html>
  );
}
