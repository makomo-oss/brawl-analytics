import { ArrowRight, ArrowUpRight, BarChart3, Sparkles, Swords, Trophy } from "lucide-react";
import Link from "@/components/document-link";

/** Decorative characters introduce the existing draft tool, without invented scores. */
export function ArenaHeroStage() {
  return <aside className="arena-home-stage" aria-label="BAN・Pick支援">
    <span className="arena-stage-corner is-tl" aria-hidden="true" />
    <span className="arena-stage-corner is-tr" aria-hidden="true" />
    <span className="arena-stage-corner is-bl" aria-hidden="true" />
    <span className="arena-stage-corner is-br" aria-hidden="true" />
    <div className="arena-stage-grid" aria-hidden="true" />
    <div className="arena-stage-label"><span>THE MATCHUP LAB</span><span>BAN / PICK</span></div>
    <span className="arena-stage-watermark" aria-hidden="true">PLAY<br />TO WIN</span>
    <div className="arena-fighter arena-fighter-amber" aria-hidden="true">
      <span className="arena-fighter-role">
        <span className="arena-fighter-role-icon"><Sparkles /></span>
        <span>CONTROLLER</span>
      </span>
      <img src="/images/arena/amber.png" alt="" width={284} height={365} decoding="async" />
      <span className="arena-fighter-name">AMBER<small>アンバー</small></span>
    </div>
    <span className="arena-stage-versus" aria-hidden="true">VS</span>
    <div className="arena-fighter arena-fighter-spike" aria-hidden="true">
      <span className="arena-fighter-role">
        <span className="arena-fighter-role-icon"><Sparkles /></span>
        <span>DAMAGE DEALER</span>
      </span>
      <img src="/images/arena/spike.png" alt="" width={262} height={309} decoding="async" />
      <span className="arena-fighter-name">SPIKE<small>スパイク</small></span>
    </div>
    <span className="arena-stage-sticker" aria-hidden="true">相性で、差をつけろ。</span>
    <Link href="/companion" className="arena-stage-action"><span><Swords aria-hidden="true" />ピック支援をはじめる</span><ArrowRight aria-hidden="true" /></Link>
  </aside>;
}

const tools = [
  { number: "01", pill: "戦績・勝率推移", icon: BarChart3, href: "/player", title: "自分を知る", eyebrow: "YOUR PERFORMANCE", lead: "戦績の中に、あなたの強み。", description: "得意キャラ・メタギャップ・クラブ分析まで。自分のプレイを、データで振り返ろう。", action: "ダッシュボードへ", className: "arena-tool-player is-sky" },
  { number: "02", pill: "勝率・使用率・ランク別", icon: Trophy, href: "/tier", title: "環境を読む", eyebrow: "READ THE META", lead: "次の試合に、誰を連れていく？", description: "勝率・使用率・ランク別の環境をチェック。モードやマップに合うキャラを見つけよう。", action: "Tier表をチェック", className: "arena-tool-meta is-gold" },
  { number: "03", pill: "6 BAN・1-2-2-1対応", icon: Swords, href: "/companion", title: "ピックを決める", eyebrow: "MAKE YOUR NEXT MOVE", lead: "その一手に、理由がある。", description: "味方のシナジー、相手へのカウンター、マップ適性。編成から、次の候補を探そう。", action: "BAN・Pick支援へ", className: "arena-tool-draft is-emerald" },
];

export function ArenaToolCards() {
  return <nav className="arena-tool-cards" aria-label="ブロラボの3つの攻略ツール">
    {tools.map(tool => {
      const Icon = tool.icon;
      return <Link key={tool.href} href={tool.href} className={`arena-tool-card ${tool.className}`}>
        <div className="arena-tool-top">
          <span className="arena-tool-icon"><Icon aria-hidden="true" /></span>
          <div className="arena-tool-top-meta">
            <span className="arena-tool-pill">{tool.pill}</span>
            <span className="arena-tool-number">{tool.number}</span>
          </div>
        </div>
        <div className="arena-tool-body">
          <span className="arena-tool-eyebrow">{tool.eyebrow}</span>
          <h2>{tool.title}</h2>
          <p className="arena-tool-lead">{tool.lead}</p>
          <p className="arena-tool-description">{tool.description}</p>
          <span className="arena-tool-action">{tool.action}<ArrowUpRight aria-hidden="true" /></span>
        </div>
      </Link>;
    })}
  </nav>;
}
