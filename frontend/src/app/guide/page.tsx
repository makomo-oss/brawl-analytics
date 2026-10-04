import Link from "next/link";
import { pageMetadata, SITE_URL } from "@/lib/seo";

export const metadata = pageMetadata(
  "ブロスタ戦績の調べ方・Tier表とピックツールの使い方",
  "プレイヤータグでブロスタの戦績・勝率を確認する方法、環境Tier表の勝率・使用率・観測件数の見方、ガチバトルのBAN/Pick支援ツールの使い方を解説します。",
  "/guide",
);

export default function GuidePage() {
  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "ブロラボ", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "使い方ガイド", item: `${SITE_URL}/guide` },
    ],
  };
  return (
    <article className="mx-auto max-w-3xl space-y-8 text-sm leading-7">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs).replace(/</g, "\\u003c") }} />
      <nav aria-label="パンくず"><Link href="/" className="text-primary underline">ブロラボ</Link><span className="text-muted-foreground"> / 使い方ガイド</span></nav>
      <header className="space-y-3">
        <h1 className="text-2xl sm:text-3xl font-extrabold leading-snug">ブロスタ戦績の調べ方・Tier表とピックツールの使い方</h1>
        <p className="text-muted-foreground">ブロラボは、ブロスタ（Brawl Stars）の戦績検索・環境Tier表・BAN/Pick支援を無料で使える分析ツールです。自分の戦績を振り返り、遊ぶモードやマップに合うキャラを選ぶための見方を紹介します。</p>
      </header>
      <nav aria-label="ガイドの目次" className="rounded-2xl border border-border bg-card p-5">
        <ul className="space-y-2 text-primary underline underline-offset-4">
          <li><a href="#player">プレイヤータグで戦績・勝率を調べる</a></li>
          <li><a href="#tier">環境Tier表とキャラ勝率ランキングの見方</a></li>
          <li><a href="#companion">ガチバトルのBAN/Pickツールを使う</a></li>
          <li><a href="#data">集計データの範囲と注意点</a></li>
        </ul>
      </nav>
      <section id="player" className="scroll-mt-24 space-y-3">
        <h2 className="text-xl font-bold">プレイヤータグでブロスタの戦績・勝率を調べる</h2>
        <ol className="list-decimal pl-5 space-y-2">
          <li>ブロスタを開き、自分のプロフィールで「#」から始まるプレイヤータグを確認します。</li>
          <li><Link href="/player" className="text-primary underline">戦績検索ページ</Link>にタグを入力します。「#」の有無はどちらでも検索できます。</li>
          <li>名前で検索する場合は、候補から対象プレイヤーを選びます。同じ名前の人がいる場合や候補が見つからない場合は、タグを使ってください。</li>
          <li>バトル履歴とキャラ別・モード別の成績を確認します。勝率とあわせて観測件数を見て、得意なキャラや苦手なモードを探します。</li>
        </ol>
        <h3 className="font-bold">戦績が表示されないときは？</h3>
        <p className="text-muted-foreground">タグの入力を確認し、プロフィールからコピーして試してください。外部APIの通信状況や保存済みデータによって取得できない場合があります。未取得の履歴や集計対象外の対戦を含む、生涯のすべての勝率を示すものではありません。</p>
      </section>
      <section id="tier" className="scroll-mt-24 space-y-3">
        <h2 className="text-xl font-bold">ブロスタ環境Tier表とキャラ勝率ランキングの見方</h2>
        <p><Link href="/tier" className="text-primary underline">環境Tier表</Link>では「全体」と「ガチバトル」を切り替え、モード・マップ・ランク帯で絞り込めます。まず自分が遊ぶ条件を選び、同じ条件でキャラを比較してください。</p>
        <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
          <li><strong className="text-foreground">Tier：</strong>収集した戦績にもとづく相対評価です。S+からDまでの区分は、すべての状況での強さを保証しません。</li>
          <li><strong className="text-foreground">勝率：</strong>集計対象での結果です。少ない観測で高くなっている場合もあるため、観測件数も確認します。</li>
          <li><strong className="text-foreground">使用率：</strong>集計対象で選ばれた割合です。人気が高いキャラが、すべてのマップで有利とは限りません。</li>
          <li><strong className="text-foreground">データ不足：</strong>評価に十分な観測がない状態です。弱いキャラと判断せず、別の条件も確認してください。</li>
        </ul>
        <p className="text-muted-foreground">集計は直近60日の収集データを対象とし、直近30日の結果を重視します。勝率の推定と使用状況を組み合わせて評価しています。キャラを選ぶと、収集した対戦での相性も確認できます。</p>
      </section>
      <section id="companion" className="scroll-mt-24 space-y-3">
        <h2 className="text-xl font-bold">ガチバトルのBAN/Pickツールを使う</h2>
        <ol className="list-decimal pl-5 space-y-2">
          <li><Link href="/companion" className="text-primary underline">ピック支援ツール</Link>でモードとマップ、自チーム、先攻チームを設定します。</li>
          <li>両チームのBANを入力します。</li>
          <li>実際のドラフトに合わせてPICKを入力し、候補の推薦を確認します。</li>
          <li>マップ適性・モード適性・味方シナジー・敵カウンターを見比べ、使えるキャラの中から選びます。</li>
        </ol>
        <p className="text-muted-foreground">敵や味方が確定するたびに候補を見直しましょう。推薦や編成有利度は参考値です。プレイヤーの技量、キャラの育成状況、戦い方などによって結果は変わります。データが不足しているマップでは推薦を表示できない場合があります。</p>
      </section>
      <section id="data" className="scroll-mt-24 space-y-3">
        <h2 className="text-xl font-bold">集計データの範囲と注意点</h2>
        <p className="text-muted-foreground">表示値は、このサービスが収集・保存したプレイヤーの戦績にもとづきます。ブロスタ全プレイヤーの全試合を網羅した公式統計ではありません。プレイヤーごとの観測なので、同じ対戦が複数のプレイヤーの履歴に含まれることがあります。</p>
        <p className="text-muted-foreground">ゲームの更新や集計条件によって評価は変わります。画面の更新日時、観測件数、選んだモードやマップを確認し、実際の対戦で試しながら使ってください。</p>
      </section>
      <p className="border-t border-border pt-5 text-xs text-muted-foreground">ブロラボは非公式のファンツールです。Supercellの公式サービスではありません。</p>
    </article>
  );
}
