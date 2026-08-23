"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Trophy, BarChart3, Cpu, Home } from "lucide-react";
import { NavigationMenu, NavigationMenuItem, NavigationMenuList, navigationMenuTriggerStyle } from "@/components/ui/navigation-menu";
import { BurolaboIcon } from "@/components/brand-icon";

export function MainNav() {
  const pathname = usePathname();
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      
      if (currentScrollY > lastScrollY && currentScrollY > 50) {
        // Scrolling down
        setIsVisible(false);
      } else {
        // Scrolling up
        setIsVisible(true);
      }
      
      setLastScrollY(currentScrollY);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [lastScrollY]);

  return (
    <>
      {/* Desktop Header */}
      <div className="hidden md:block border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container flex h-16 items-center px-4 max-w-7xl mx-auto">
          <Link href="/" className="mr-6 flex items-center space-x-2.5 group">
            <BurolaboIcon size={30} className="group-hover:scale-110 group-hover:rotate-6 transition-all duration-300 shadow-sm" />
            <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-primary via-purple-400 to-cyan-400 bg-clip-text text-transparent">
              ブロラボ
            </span>
          </Link>
          <NavigationMenu>
            <NavigationMenuList className="gap-2">
              <NavigationMenuItem>
                <Link href="/" className={navigationMenuTriggerStyle()}>
                  ホーム
                </Link>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <Link href="/player" className={navigationMenuTriggerStyle()}>
                  ダッシュボード
                </Link>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <Link href="/tier" className={navigationMenuTriggerStyle()}>
                  Tier表
                </Link>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <Link href="/companion" className={navigationMenuTriggerStyle()}>
                  ピック支援 (BAN/Pick)
                </Link>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>
        </div>
      </div>

      {/* Mobile Top Header (Just Logo) */}
      <div className="md:hidden border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
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
        className={`md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-t border-border/50 pb-safe transition-transform duration-300 ease-in-out ${
          isVisible ? "translate-y-0" : "translate-y-[150%]"
        }`}
      >
        <div className="flex justify-around items-center h-16 px-2">
          <Link 
            href="/" 
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${pathname === "/" ? "text-primary" : "text-muted-foreground"}`}
          >
            <Home className="w-5 h-5" />
            <span className="text-[10px] font-medium">ホーム</span>
          </Link>
          <Link 
            href="/player" 
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${pathname.startsWith("/player") || pathname.startsWith("/dashboard") ? "text-primary" : "text-muted-foreground"}`}
          >
            <BarChart3 className="w-5 h-5" />
            <span className="text-[10px] font-medium">ダッシュボード</span>
          </Link>
          <Link 
            href="/tier" 
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${pathname === "/tier" || pathname === "/tier-list" ? "text-primary" : "text-muted-foreground"}`}
          >
            <Trophy className="w-5 h-5" />
            <span className="text-[10px] font-medium">Tier表</span>
          </Link>
          <Link 
            href="/companion" 
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${pathname === "/companion" ? "text-primary" : "text-muted-foreground"}`}
          >
            <Cpu className="w-5 h-5" />
            <span className="text-[10px] font-medium">ピック支援</span>
          </Link>
        </div>
      </div>
    </>
  );
}
