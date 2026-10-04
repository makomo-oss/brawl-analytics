import Link from "next/link";

const guides = {
  player: {
    title: "ブロスタの戦績・勝率を確認する方法",
    text: "ゲーム内プロフィールでプレイヤータグを確認し、検索欄に入力してください。タグは先頭に#を付けても検索できます。名前で見つからない場合は、プレイヤータグで検索すると対象を指定できます。バトル履歴やモード別の成績を見比べて、得意なキャラと苦手なモードを探しましょう。",
    link: "/guide#player",
    label: "プレイヤータグの調べ方と戦績の読み方",
  },
  tier: {
    title: "ブロスタTier表の見方とキャラ選び",
    text: "全体とガチバトルを切り替え、モード・マップ・ランク帯に合うキャラを比較できます。Tierは収集した戦績の勝率と使用状況をもとにした相対評価です。勝率だけでなく観測件数も確認し、データ不足のキャラは判断を保留してください。",
    link: "/guide#tier",
    label: "Tierの集計方法と勝率・使用率の読み方",
  },
  companion: {
    title: "ガチバトルのBAN・ピック支援の使い方",
    text: "モードとマップ、自チームと先攻チームを選んでドラフトを開始します。両チームのBANとPICKを入力すると、マップ適性・モード適性・味方との相性・敵へのカウンターを参考に候補を比較できます。推薦は収集データにもとづく参考値です。育成状況や使い慣れたキャラも考えて選びましょう。",
    link: "/guide#companion",
    label: "BAN/Pickツールの操作と推薦の読み方",
  },
};

export function FeatureGuide({ feature }: { feature: keyof typeof guides }) {
  const guide = guides[feature];
  return (
    <section aria-labelledby={`${feature}-guide`} className="mt-10 rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-3">
      <h2 id={`${feature}-guide`} className="text-lg font-bold">{guide.title}</h2>
      <p className="text-sm leading-7 text-muted-foreground">{guide.text}</p>
      <Link href={guide.link} className="inline-block text-sm text-primary underline underline-offset-4">{guide.label}</Link>
    </section>
  );
}
