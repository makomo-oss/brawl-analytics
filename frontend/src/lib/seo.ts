import type { Metadata } from "next";

export const SITE_URL = "https://brawl-lab.sozai-hub.com";

export function pageMetadata(title: string, description: string, path: string): Metadata {
  const socialTitle = `${title} | ブロラボ`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      locale: "ja_JP",
      siteName: "ブロラボ",
      title: socialTitle,
      description,
      url: path,
      images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "ブロラボ" }],
    },
    twitter: { card: "summary", title: socialTitle, description, images: ["/icon-512.png"] },
  };
}
