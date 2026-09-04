"use client";

import { useEffect, useState } from "react";

/**
 * The page header, which grows a shadow once there is something scrolled
 * underneath it to cast onto.
 */
export function StickyHeader({ children }: { children: React.ReactNode }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="app-header" data-scrolled={scrolled}>
      {children}
    </header>
  );
}
