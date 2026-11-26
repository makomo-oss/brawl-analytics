// Primary destinations shared by the footer, /about and /llms.txt.
export const SITE_SECTIONS = [
  { path: "/player", label: "戦績検索", description: "プレイヤー名・タグからトロフィー、バトル履歴、キャラ・モード・マップ別の勝率を確認" },
  { path: "/tier", label: "Tier表", description: "全体とガチバトル（エリート以上）の最強キャラランキング・ティア表" },
  { path: "/brawlers", label: "キャラ一覧", description: "キャラごとの勝率・使用率・相性・おすすめマップ" },
  { path: "/modes", label: "モード別", description: "モードごとのキャラ別勝率ランキング" },
  { path: "/maps", label: "マップ別", description: "マップごとのキャラ別勝率ランキング" },
  { path: "/companion", label: "BAN・ピック", description: "ガチバトルのBAN・ピック候補を対戦データで提案" },
  { path: "/about", label: "運営・集計方法", description: "データの出典、集計方法、更新頻度、免責事項" },
  { path: "/contact", label: "お問い合わせ・要望", description: "機能要望・不具合報告・データ修正依頼などの送信フォーム" },
] as const

export const FAN_CONTENT_NOTICE = "このコンテンツは非公式であり、Supercellによって承認されたものではありません。詳しくはSupercellのファンコンテンツポリシー（www.supercell.com/fan-content-policy）をご覧ください。"
