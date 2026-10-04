import { pageMetadata, searchCopy } from "@/lib/seo";

export const metadata = pageMetadata(
  searchCopy.tier.title,
  searchCopy.tier.description,
  "/tier",
);

export default function TierLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
