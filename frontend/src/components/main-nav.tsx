import Link from "next/link";
import { NavigationMenu, NavigationMenuItem, NavigationMenuList, navigationMenuTriggerStyle } from "@/components/ui/navigation-menu";

export function MainNav() {
  return (
    <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center px-4 max-w-7xl mx-auto">
        <Link href="/" className="mr-6 flex items-center space-x-2">
          <span className="font-bold text-xl sm:inline-block bg-gradient-to-r from-primary to-accent-foreground bg-clip-text text-transparent">
            BrawlAnalytics
          </span>
        </Link>
        <NavigationMenu>
          <NavigationMenuList className="gap-2">
            <NavigationMenuItem>
              <Link href="/companion" className={navigationMenuTriggerStyle()}>
                BAN/Pick支援
              </Link>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <Link href="/tier-list" className={navigationMenuTriggerStyle()}>
                環境分析
              </Link>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <Link href="/dashboard" className={navigationMenuTriggerStyle()}>
                ダッシュボード
              </Link>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>
      </div>
    </div>
  );
}
