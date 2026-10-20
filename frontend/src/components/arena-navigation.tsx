import { ArrowUpRight, BarChart3, Home, Swords, Trophy, Users } from "lucide-react";
import Link from "@/components/document-link";
import { BrawlerDirectoryLink } from "@/components/brawler-directory-link";
import { BurolaboIcon } from "@/components/brand-icon";

const destinations = [
  { href: "/", label: "ホーム", icon: Home },
  { href: "/player", label: "ダッシュボード", icon: BarChart3 },
  { href: "/tier", label: "Tier表", icon: Trophy },
  { href: "/brawlers", label: "キャラ一覧", icon: Users },
  { href: "/companion", label: "ピック支援", icon: Swords },
];

function isCurrent(href: string, pathname: string) {
  if (href === "/") return pathname === "/";
  if (href === "/player") return pathname.startsWith("/player") || pathname.startsWith("/dashboard");
  if (href === "/tier") return pathname === "/tier" || pathname === "/tier-list" || pathname.startsWith("/modes") || pathname.startsWith("/maps");
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Destination({ item, pathname, mobile = false }: { item: typeof destinations[number]; pathname: string; mobile?: boolean }) {
  const active = isCurrent(item.href, pathname);
  const Icon = item.icon;
  const props = {
    className: `${mobile ? "arena-bottom-link" : "arena-tab-link"}${active ? " is-active" : ""}`,
    "aria-current": active ? "page" as const : undefined,
    children: <><Icon aria-hidden="true" /><span>{item.label}</span></>,
  };
  return item.href === "/brawlers" ? <BrawlerDirectoryLink {...props} /> : <Link href={item.href} {...props} />;
}

export function ArenaNavigation({ pathname, visible }: { pathname: string; visible: boolean }) {
  return <>
    <header className="arena-site-header">
      <div className="arena-header-inner">
        <Link href="/" className="arena-brand" aria-label="ブロラボ ホーム">
          <BurolaboIcon size={32} glow={false} />
          <span>ブロラボ<small>BRAWL LAB</small></span>
        </Link>
        <nav className="arena-site-tabbar" aria-label="メインナビゲーション">
          {destinations.map(item => <Destination key={item.href} item={item} pathname={pathname} />)}
        </nav>
        <Link href="/player" className="arena-mobile-dashboard" aria-current={isCurrent("/player", pathname) ? "page" : undefined}>
          <BarChart3 aria-hidden="true" /><span>ダッシュボード</span><ArrowUpRight aria-hidden="true" />
        </Link>
      </div>
    </header>
    <nav className={`arena-bottom-nav pb-safe${visible ? "" : " is-hidden"}`} aria-label="モバイルナビゲーション">
      {[destinations[3], destinations[1], destinations[2], destinations[4]].map(item =>
        <Destination key={item.href} item={item} pathname={pathname} mobile />)}
    </nav>
  </>;
}
