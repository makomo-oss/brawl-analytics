"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import PlayerView from "./player-view";

function PlayerContent() {
  const searchParams = useSearchParams();
  const tag = searchParams.get("tag") || "";
  return <PlayerView defaultTag={tag} />;
}

export default function PlayerPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-muted-foreground animate-pulse">プレイヤー戦績を読み込み中...</div>}>
      <PlayerContent />
    </Suspense>
  );
}
