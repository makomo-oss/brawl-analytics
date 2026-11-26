"use client";

import { ArrowUpRight, BarChart3, Home, MessageSquarePlus, Swords, Trophy, Users } from "lucide-react";
import Link from "@/components/document-link";
import { BrawlerDirectoryLink } from "@/components/brawler-directory-link";
import { BurolaboIcon } from "@/components/brand-icon";
import { useArenaTabIndicator } from "@/components/use-arena-tab-indicator";
import { CONTACT_FROM_STORAGE_KEY } from "@/lib/contact";

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
  const desktop = useArenaTabIndicator(pathname);
  const mobile = useArenaTabIndicator(pathname);
  return <>
    <a href="#main-content" className="arena-skip-link">メインコンテンツへ</a>
    <header className="arena-site-header">
      <div className="arena-header-inner">
        <Link href="/" className="arena-brand" aria-label="ブロラボ ホーム">
          <BurolaboIcon size={32} />
          <span>ブロラボ<small>BRAWL LAB</small></span>
        </Link>
        <nav ref={desktop.navigation} className="arena-site-tabbar" aria-label="メインナビゲーション">
          <span ref={desktop.indicator} className="arena-nav-indicator arena-desktop-indicator" aria-hidden="true" />
          {destinations.map(item => <Destination key={item.href} item={item} pathname={pathname} />)}
        </nav>
        <div className="arena-header-actions">
          <Link
            href="/contact"
            className={`arena-header-contact${pathname === "/contact" ? " is-active" : ""}`}
            aria-current={pathname === "/contact" ? "page" : undefined}
            aria-label="お問い合わせ・要望"
            onClick={() => {
              if (pathname && pathname !== "/contact") {
                try {
                  window.sessionStorage.setItem(CONTACT_FROM_STORAGE_KEY, pathname);
                } catch {
                  // Ignore storage restrictions.
                }
              }
            }}
          >
            <MessageSquarePlus aria-hidden="true" />
            <span>お問い合わせ</span>
          </Link>
          <Link href="/player" className="arena-mobile-dashboard" aria-current={isCurrent("/player", pathname) ? "page" : undefined}>
            <BarChart3 aria-hidden="true" /><span>ダッシュボード</span><ArrowUpRight aria-hidden="true" />
          </Link>
        </div>
      </div>
    </header>
    <nav ref={mobile.navigation} className={`arena-bottom-nav pb-safe${visible ? "" : " is-hidden"}`} aria-label="モバイルナビゲーション">
      <span ref={mobile.indicator} className="arena-nav-indicator arena-mobile-indicator" aria-hidden="true" />
      {[destinations[3], destinations[1], destinations[2], destinations[4]].map(item =>
        <Destination key={item.href} item={item} pathname={pathname} mobile />)}
    </nav>
  </>;
}
