import Link from "@/components/document-link"
import { FAN_CONTENT_NOTICE } from "@/lib/site-sections"
import { ABOUT_REVISED } from "@/lib/about"
import { jstDate } from "@/lib/dates"

const card = "rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-6 space-y-3 min-w-0"
const heading = "text-2xl sm:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-primary via-purple-400 to-cyan-400 bg-clip-text text-transparent"
const text = "text-sm leading-relaxed text-muted-foreground break-words"

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return <section id={id} aria-labelledby={`${id}-title`} className={card}>
    <h2 id={`${id}-title`} className="font-bold text-lg">{title}</h2>
    {children}
  </section>
}

export default function AboutView() {
  const revised = jstDate(ABOUT_REVISED)
  return <div className="arena-workspace max-w-4xl mx-auto space-y-6 sm:space-y-8">
    <header className="space-y-3">
      <h1 className={heading}>ブロラボについて・集計方法</h1>
      <p className={text}>ブロラボ（Brawl Lab）は、ブロスタ（Brawl Stars）の戦績検索、最強キャラのTier表、キャラ・モード・マップ別の勝率、ガチバトルのBAN・ピック支援を無料で提供する非公式ファンツールです。運営：ブロラボ運営。</p>
    </header>
    <Section id="source" title="データの出典">
      <p className={text}>統計はSupercellが提供するBrawl Stars公式APIから取得した対戦記録をもとにしています。対戦記録は約30分ごとに収集し、サイトで戦績を検索・同期したプレイヤーの対戦も含まれます。キャラとモードの画像はBrawlifyのものを使用しています。</p>
    </Section>
    <Section id="method" title="集計方法">
      <ul className={`${text} list-disc pl-5 space-y-2`}>
        <li>直近60日の対戦記録を集計し、特に直近30日のデータを重視します。件数は「プレイヤーごとの対戦件数」で、1試合に複数の記録されたプレイヤーがいればそれぞれ数えます。</li>
        <li>「全体」は記録されたすべての対戦、「ガチバトル（エリート以上）」はエリート以上のプレイヤーによるガチバトルだけを対象にし、2つのデータは混ぜずに集計します。</li>
        <li>Tierは、同じモード・マップの平均と比べた勝ちやすさ（重み70%）と使用率（重み30%）を組み合わせたスコアで決めます。全体Tierは分布に応じた区分、ガチバトル Tierは固定のスコア基準で分類します。</li>
        <li>試合数が少ないキャラは評価を控えめにし、20件未満のキャラは「データ不足」としてTierを付けません。データが十分でないキャラ・マップのページは検索エンジンに登録しない設定にしています。</li>
        <li>おすすめマップは勝率の95%信頼区間の下限が高い順に表示し、少ない試合での偶然の高勝率を上位にしにくくしています。相性は、敵・味方にそのキャラがいる試合のチーム成績を補正した勝率です。</li>
      </ul>
    </Section>
    <Section id="update" title="更新頻度">
      <p className={text}>集計は1日2回（日本時間の4時ごろと16時ごろ）更新され、各ページには5分以内に反映されます。各ページには集計日時を表示しています。</p>
    </Section>
    <Section id="privacy" title="プレイヤーデータの扱い">
      <p className={text}>保存した対戦記録は60日を過ぎると削除します。自動同期はプレイヤーページでONにした場合だけ動作します。公開している統計やデータファイルにはプレイヤータグなどの個人を特定する情報を含めていません。</p>
    </Section>
    <Section id="data" title="機械可読データ">
      <p className={text}>AIアシスタントや外部ツール向けに、集計データの一覧とJSONを公開しています。</p>
      <ul className={`${text} list-disc pl-5 space-y-1`}>
        <li><a className="text-primary hover:underline" href="/llms.txt">/llms.txt</a>（サイト概要と現在の上位キャラ）</li>
        <li><a className="text-primary hover:underline" href="/data/index.json">/data/index.json</a>（データ一覧）</li>
        <li><a className="text-primary hover:underline" href="/data/catalog.jsonld">/data/catalog.jsonld</a>（データカタログ）</li>
      </ul>
    </Section>
    <Section id="citation" title="引用について">
      <p className={text}>データを紹介・引用する場合は「ブロラボ（https://brawl-lab.sozai-hub.com）」と集計日時を記載してください。順位や勝率は集計のたびに変わります。</p>
    </Section>
    <Section id="disclaimer" title="免責事項">
      <p className={text}>{FAN_CONTENT_NOTICE}統計は記録された対戦にもとづく参考値で、ゲームの結果を保証するものではありません。</p>
    </Section>
    <p className="text-xs text-muted-foreground">{revised && <>最終改訂：<time dateTime={revised.iso}>{revised.long}</time> · </>}<Link href="/tier" className="text-primary hover:underline">Tier表を見る</Link></p>
  </div>
}
