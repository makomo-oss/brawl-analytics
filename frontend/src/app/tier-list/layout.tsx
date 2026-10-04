import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "/tier" },
};

export default function LegacyTierLayout({ children }: { children: React.ReactNode }) {
  return children;
}
