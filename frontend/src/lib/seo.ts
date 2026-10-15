import type { Metadata } from "next";

export const SITE_URL = "https://brawl-lab.sozai-hub.com";

// Shared by Next's static pages and the live character-page renderer.
export const searchCopy = {
  home: {
    title: "ブロスタ攻略ツール｜戦績検索・最強キャラ・ティア表",
    description: "ブロスタ（Brawl Stars）の無料攻略・分析ツール。名前・タグでプレイヤーの戦績、勝率、バトル履歴を検索。最強キャラランキング・ティア表、キャラの相性・おすすめマップ、ガチバトルのBAN・ピック支援を対戦データで確認できます。",
  },
  player: {
    title: "ブロスタ戦績確認ツール｜勝率・プレイヤー検索",
    description: "プレイヤー名・タグからブロスタの戦績を無料検索。トロフィー、最近のバトル履歴、保存済み対戦の勝率・キャラ別・モード別成績を確認できます。通常バトルとガチバトルのプレイヤー分析に。",
  },
  tier: {
    title: "ブロスタ最強キャラランキング・ティア表｜勝率で比較",
    description: "ブロスタの最強キャラ・環境キャラ選びを対戦データで支援。Tier表（ティア表）で勝率・使用率・集計件数を比較し、全体・ガチバトル、モード・マップ・ランク帯ごとのおすすめキャラと相性を確認できます。",
  },
  companion: {
    title: "ブロスタ BAN・ピックツール｜ガチバトルのおすすめ編成",
    description: "ガチバトルのキャラ選び・編成を対戦データで支援。マップ、BAN、味方・敵のピックを入力し、おすすめキャラとカウンター候補、編成の有利度を比較できる無料ツールです。",
  },
  brawlers: {
    title: "ブロスタキャラ一覧｜レア度・勝率・相性を比較",
    description: "ブロスタのキャラクターを名前で検索、レア度・勝率・使用率で並び替え。キャラ別のTier評価、得意なモード・おすすめマップ、敵味方との相性を対戦データから比較できます。",
  },
} as const;

export function brawlerSearchCopy(name: string) {
  return {
    title: `ブロスタ ${name}の評価・相性・おすすめマップ`,
    description: `${name}の強さ・Tier評価を対戦データで確認。勝率・使用率、得意なモード・おすすめマップ、有利・不利な敵キャラとカウンター、相性のよい味方を集計件数とともに比較できます。全体・ガチバトル別のキャラ選びに。`,
  };
}

export function pageMetadata(title: string, description: string, path: string): Metadata {
  const socialTitle = `${title} | ブロラボ`;
  return {
    title,
    description,
    alternates: { canonical: path, ...(/^\/(brawlers|modes|maps)(\/|$)/.test(path) ? { types: { "application/json": `/data${path}${/^\/(brawlers|modes|maps)$/.test(path) ? "/index" : ""}.json` } } : {}) },
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
