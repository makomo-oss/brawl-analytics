import { pageMetadata, searchCopy } from "@/lib/seo";

export const metadata = pageMetadata(
  searchCopy.companion.title,
  searchCopy.companion.description,
  "/companion",
);

export default function CompanionLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
