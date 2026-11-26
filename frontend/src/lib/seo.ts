import type { Metadata } from "next";

export const SITE_URL = "https://brawl-lab.sozai-hub.com";

// Shared by Next's static pages and the live character-page renderer.
export const searchCopy = {
  home: {
    title: "ブロスタ攻略ツール｜戦績検索・現環境最強キャラ・ピック提案",
    description: "ブロスタ（Brawl Stars）の無料・登録不要の攻略・分析ツール。名前・タグでプレイヤーの戦績、勝率、バトル履歴を検索。現環境の最強キャラランキング・ティア表、マップ・モード別おすすめキャラ、ガチバトルのBAN・ピック提案を対戦データで確認できます。",
  },
  player: {
    title: "ブロスタ戦績検索・勝率確認ツール｜プレイヤー名・タグで無料分析",
    description: "登録不要・無料。ブロスタのプレイヤー名やタグから戦績・勝率・トロフィー・ガチバトル成績・バトル履歴を即確認。戦績の見方や直近7・30・60日のキャラ・モード別勝率分析、クラブ検索、自動同期に対応。",
  },
  tier: {
    title: "ブロスタ現環境最強キャラランキング・ティア表｜勝率比較",
    description: "ブロスタの現環境最強キャラ・Tier表（ティア表）を公式APIの対戦データで毎日更新。全体・ガチバトル（エリート以上）の勝率・使用率を比較し、モード・マップ・ランク帯ごとのおすすめキャラと相性を確認できます。",
  },
  companion: {
    title: "ブロスタ ガチバトル ピックツール｜無料BAN・ピック提案サイト",
    description: "登録不要・無料のブロスタ ガチバトルBAN・ピック提案ツール。マップ・BAN・味方と敵のピックを選ぶだけで、最新の対戦データからおすすめキャラ、カウンター候補、味方シナジー、勝率予測を自動計算します。",
  },
  brawlers: {
    title: "ブロスタキャラ一覧｜全キャラのTier・勝率・レア度を比較",
    description: "ブロスタの全キャラクターを名前・レア度で絞り込み、勝率・使用率・Tierで比較。キャラ別の評価、得意なモード・おすすめマップ、有利・不利なカウンター相性を対戦データから確認できます。",
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
