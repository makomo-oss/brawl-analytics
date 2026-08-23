import PlayerView from "../player-view";

export function generateStaticParams() {
  return [{ tag: "demo" }];
}

export default async function PlayerDetailPage({ params }: { params: Promise<{ tag: string }> }) {
  const resolvedParams = await params;
  return <PlayerView defaultTag={resolvedParams?.tag} />;
}
