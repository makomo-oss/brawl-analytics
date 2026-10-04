import { pageMetadata, searchCopy } from "@/lib/seo";

export const metadata = pageMetadata(
  searchCopy.player.title,
  searchCopy.player.description,
  "/player",
);

export default function PlayerLayout({ children }: { children: React.ReactNode }) {
  return <>
    <header className="mb-8 space-y-2">
      <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">ブロスタ戦績検索・勝率確認</h1>
    </header>
    {children}
  </>;
}
