import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD, PHASE_DEVELOPMENT_SERVER } from "next/constants";
import { existsSync } from "node:fs";
import { prepareBrawlerPages } from "./scripts/prepare-brawler-pages.mjs";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
};

export default async function config(phase: string): Promise<NextConfig> {
  if (!process.env.BRAWLER_SNAPSHOT_READY && (phase === PHASE_PRODUCTION_BUILD ||
      (phase === PHASE_DEVELOPMENT_SERVER && !existsSync(".seo-data/brawler-pages.json")))) {
    await prepareBrawlerPages(process.env.NEXT_PUBLIC_API_URL, process.cwd());
    process.env.BRAWLER_SNAPSHOT_READY = "1";
  }
  return nextConfig;
}
