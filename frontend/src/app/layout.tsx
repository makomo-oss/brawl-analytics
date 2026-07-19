import type { Metadata } from "next";
import "./globals.css";
import { Inter } from "next/font/google";
import { MainNav } from "@/components/main-nav";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "BrawlAnalytics - ガチバトル支援",
  description: "Brawl Stars ガチバトル分析＆Pick支援ツール",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="dark">
      <body className={`${inter.className} min-h-screen bg-background text-foreground antialiased`}>
        <MainNav />
        <main className="container mx-auto p-4 sm:p-6 lg:p-8 max-w-7xl pb-24 md:pb-8">
          {children}
        </main>
      </body>
    </html>
  );
}
