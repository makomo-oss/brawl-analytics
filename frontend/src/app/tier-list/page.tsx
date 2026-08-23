"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function TierListRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/tier");
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="animate-pulse text-muted-foreground">/tier へリダイレクト中...</div>
    </div>
  );
}
