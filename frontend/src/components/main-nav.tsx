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

  return <ArenaNavigation pathname={pathname} visible={isVisible} />;
}
