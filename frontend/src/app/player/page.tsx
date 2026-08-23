"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import PlayerView from "./player-view";

function PlayerIndexContent() {
  const searchParams = useSearchParams();
  const queryTag = searchParams.get("tag") || "";
  return <PlayerView defaultTag={queryTag} />;
}

export default function PlayerPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-muted-foreground animate-pulse">読み込み中...</div>}>
      <PlayerIndexContent />
    </Suspense>
  );
}
