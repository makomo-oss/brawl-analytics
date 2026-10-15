"use client";

import { useState, useEffect, useRef } from "react";
import Link from "@/components/document-link";
import { usePathname } from "next/navigation";
import { Trophy, BarChart3, Cpu, Users } from "lucide-react";
const headerLinkClass = "group/navigation-menu-trigger inline-flex h-9 w-max items-center justify-center rounded-lg px-2.5 py-1.5 text-sm font-medium transition-all outline-none hover:bg-muted focus:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50";
import { BurolaboIcon } from "@/components/brand-icon";
import { BrawlerDirectoryLink } from "@/components/brawler-directory-link";

export function MainNav() {
  const pathname = usePathname();
  const brawlersActive = pathname === "/brawlers" || pathname.startsWith("/brawlers/");
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    let frame = 0;
    const handleScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const currentScrollY = window.scrollY;
        const isAtBottom = window.innerHeight + currentScrollY >= document.documentElement.scrollHeight - 50;
        setIsVisible(isAtBottom || currentScrollY <= lastScrollY.current || currentScrollY <= 50);
        lastScrollY.current = currentScrollY;
      });
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <>
      {/* Desktop Header */}
      <div className="hidden lg:block border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container flex h-16 items-center px-4 max-w-7xl mx-auto">
          <Link href="/" className="mr-6 flex items-center space-x-2.5 group">
            <BurolaboIcon size={30} className="group-hover:scale-110 group-hover:rotate-6 transition-all duration-300 shadow-sm" />
            <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-primary via-purple-400 to-cyan-400 bg-clip-text text-transparent">
              ブロラボ
            </span>
          </Link>
          <nav aria-label="メインナビゲーション" className="relative flex max-w-max flex-1 items-center justify-center">
            <ul className="flex flex-1 list-none items-center justify-center gap-2">
              <li className="relative">
                <Link href="/" className={headerLinkClass}>
                  ホーム
                </Link>
              </li>
              <li className="relative">
                <Link href="/player" className={headerLinkClass}>
                  戦績検索
                </Link>
              </li>
              <li className="relative">
                <Link href="/tier" className={headerLinkClass}>
                  Tier表
                </Link>
              </li>
              <li className="relative">
                <BrawlerDirectoryLink aria-current={pathname === "/brawlers" ? "page" : undefined} className={`${headerLinkClass} gap-2 ${brawlersActive ? "text-primary bg-primary/10" : ""}`}>
                  <Users aria-hidden="true" className="w-4 h-4" />キャラ一覧
                </BrawlerDirectoryLink>
              </li>
              <li className="relative">
                <Link href="/companion" className={headerLinkClass}>
                  BAN・ピックツール
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </div>

      {/* Mobile Top Header (Just Logo) */}
      <div className="lg:hidden border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="flex h-14 items-center justify-center px-4">
          <Link href="/" className="flex items-center space-x-2 group">
            <BurolaboIcon size={24} className="group-hover:scale-110 transition-transform duration-300" />
            <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-primary via-purple-400 to-cyan-400 bg-clip-text text-transparent">
              ブロラボ
            </span>
          </Link>
        </div>
      </div>

      {/* Mobile Bottom Tab Navigation */}
      <div 
        className={`lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-t border-border/50 pb-safe transition-transform duration-300 ease-in-out ${
          isVisible ? "translate-y-0" : "translate-y-[150%]"
        }`}
      >
        <div className="flex justify-around items-center h-16 px-2">
          <BrawlerDirectoryLink
            aria-current={pathname === "/brawlers" ? "page" : undefined}
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-[-2px] ${brawlersActive ? "text-primary" : "text-muted-foreground"}`}
          >
            <Users aria-hidden="true" className="w-5 h-5" />
            <span className="text-[10px] font-medium">キャラ一覧</span>
          </BrawlerDirectoryLink>
          <Link 
            href="/player" 
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${pathname.startsWith("/player") || pathname.startsWith("/dashboard") ? "text-primary" : "text-muted-foreground"}`}
          >
            <BarChart3 className="w-5 h-5" />
            <span className="text-[10px] font-medium">戦績検索</span>
          </Link>
          <Link 
            href="/tier" 
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${pathname === "/tier" || pathname === "/tier-list" || pathname.startsWith("/modes") || pathname.startsWith("/maps") ? "text-primary" : "text-muted-foreground"}`}
          >
            <Trophy className="w-5 h-5" />
            <span className="text-[10px] font-medium">Tier表</span>
          </Link>
          <Link 
            href="/companion" 
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${pathname === "/companion" ? "text-primary" : "text-muted-foreground"}`}
          >
            <Cpu className="w-5 h-5" />
            <span className="text-[9px] font-medium whitespace-nowrap">BAN・ピックツール</span>
          </Link>
        </div>
      </div>
    </>
  );
}
