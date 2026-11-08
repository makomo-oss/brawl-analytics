import { pageMetadata } from "@/lib/seo";
import { playerCopy } from "@/lib/page-copy";
import { PlayerFaq, PlayerHeader } from "./player-intro";

export const metadata = pageMetadata(
  playerCopy.title,
  playerCopy.description,
  "/player",
);

export default function PlayerLayout({ children }: { children: React.ReactNode }) {
  return <>
    <PlayerHeader />
    {children}
    <PlayerFaq />
  </>;
}
