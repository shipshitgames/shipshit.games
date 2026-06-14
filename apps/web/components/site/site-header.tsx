"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { Menu, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { PALETTE_OPEN_EVENT } from "@/components/site/command-palette";

const NAV = [
  { label: "Games", href: "/games" },
  { label: "Factions", href: "/factions" },
  { label: "Assets", href: "/assets" },
  { label: "Build Log", href: "/log" },
  { label: "Videos", href: "/youtube" },
  { label: "Studio Pass", href: "/pricing" },
] as const;

const PLAY = { label: "Play ↗", href: "https://deadrot.com" } as const;

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function openPalette() {
  window.dispatchEvent(new Event(PALETTE_OPEN_EVENT));
}

function subscribeToScroll(callback: () => void) {
  window.addEventListener("scroll", callback, { passive: true });
  return () => window.removeEventListener("scroll", callback);
}

function getScrolledSnapshot() {
  return window.scrollY > 24;
}

export function SiteHeader() {
  const pathname = usePathname();
  const scrolled = useSyncExternalStore(
    subscribeToScroll,
    getScrolledSnapshot,
    () => false
  );
  const [open, setOpen] = useState(false);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-40 transition-all duration-300",
        scrolled
          ? "border-b border-gunmetal/60 bg-void/85 backdrop-blur-md"
          : "bg-gradient-to-b from-void/80 to-transparent"
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link
          href="/"
          className="flex items-center"
          aria-label="Ship Shit Games home"
        >
          <Image
            src="/brand/shipshit-games-logo-transparent.png"
            alt=""
            aria-hidden="true"
            width={44}
            height={44}
            className="h-11 w-11 object-contain drop-shadow-[0_0_12px_rgba(193,18,31,0.28)]"
          />
        </Link>

        <nav className="hidden items-center gap-6 lg:flex">
          {NAV.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              aria-current={isActive(pathname, i.href) ? "page" : undefined}
              className={cn(
                "border-b-2 font-display text-sm font-bold uppercase tracking-widest transition-colors",
                isActive(pathname, i.href)
                  ? "border-hellfire text-bone"
                  : "border-transparent text-ash hover:text-bone"
              )}
            >
              {i.label}
            </Link>
          ))}
          <a
            href={PLAY.href}
            target="_blank"
            rel="noreferrer"
            className="border-b-2 border-transparent font-display text-sm font-bold uppercase tracking-widest text-hellfire transition-colors hover:text-blood-hot"
          >
            {PLAY.label}
          </a>
          <button
            type="button"
            onClick={openPalette}
            aria-label="Open command palette"
            className="rounded-md border border-gunmetal bg-coal/80 px-2 py-1 font-mono text-xs text-ash transition-colors hover:border-hellfire hover:text-bone"
          >
            <kbd className="tracking-widest">⌘K</kbd>
          </button>
        </nav>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-bone lg:hidden"
          aria-label="Toggle menu"
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>

      {open ? (
        <nav className="flex flex-col gap-1 border-t border-gunmetal/60 bg-void/95 px-6 py-4 backdrop-blur-md lg:hidden">
          {NAV.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              onClick={() => setOpen(false)}
              aria-current={isActive(pathname, i.href) ? "page" : undefined}
              className={cn(
                "py-2 font-display text-sm font-bold uppercase tracking-widest",
                isActive(pathname, i.href)
                  ? "text-bone"
                  : "text-ash hover:text-bone"
              )}
            >
              {i.label}
            </Link>
          ))}
          <a
            href={PLAY.href}
            target="_blank"
            rel="noreferrer"
            onClick={() => setOpen(false)}
            className="py-2 font-display text-sm font-bold uppercase tracking-widest text-hellfire hover:text-blood-hot"
          >
            {PLAY.label}
          </a>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              openPalette();
            }}
            className="mt-2 w-fit rounded-md border border-gunmetal bg-coal/80 px-3 py-1.5 text-left font-mono text-xs text-ash hover:border-hellfire hover:text-bone"
          >
            <kbd className="tracking-widest">⌘K</kbd>
            <span className="ml-2 uppercase tracking-widest">Search</span>
          </button>
        </nav>
      ) : null}
    </header>
  );
}
