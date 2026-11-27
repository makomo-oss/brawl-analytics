"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { ArenaNavigation } from "@/components/arena-navigation";

export function MainNav() {
  const pathname = usePathname();
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    let frame = 0;
    const handleScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        const currentScrollY = Math.max(0, Math.min(window.scrollY, maxScroll));
        if (Math.abs(currentScrollY - lastScrollY.current) < 4 && currentScrollY > 48 && currentScrollY < maxScroll - 50) {
          return;
        }
        const isAtBottom = maxScroll > 0 && currentScrollY >= maxScroll - 50;
        setIsVisible(isAtBottom || currentScrollY <= lastScrollY.current || currentScrollY <= 48);
        lastScrollY.current = currentScrollY;
      });
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return <ArenaNavigation pathname={pathname} visible={isVisible} />;
}
