import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "/companion" },
};

export default function LegacyCoachLayout({ children }: { children: React.ReactNode }) {
  return children;
}
