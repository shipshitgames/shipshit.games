"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

import { cn } from "@/lib/utils";

const NAV = [
  { label: "Games", href: "/#games" },
  { label: "Universe", href: "/universe" },
  { label: "Factions", href: "/universe#factions" },
  { label: "Bestiary", href: "/universe#bestiary" },
];
const WATCH = "https://youtube.com/@shipshitshow";

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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
          className="font-display text-lg font-bold uppercase tracking-tight text-bone"
        >
          Ship <span className="text-blood">Shit</span> Games
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {NAV.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className="font-display text-sm font-bold uppercase tracking-widest text-ash transition-colors hover:text-bone"
            >
              {i.label}
            </Link>
          ))}
          <a
            href={WATCH}
            target="_blank"
            rel="noreferrer"
            className="font-display text-sm font-bold uppercase tracking-widest text-hellfire transition-colors hover:text-blood"
          >
            Watch ↗
          </a>
        </nav>

        <button
          onClick={() => setOpen((o) => !o)}
          className="text-bone md:hidden"
          aria-label="Toggle menu"
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>

      {open ? (
        <nav className="flex flex-col gap-1 border-t border-gunmetal/60 bg-void/95 px-6 py-4 backdrop-blur-md md:hidden">
          {NAV.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              onClick={() => setOpen(false)}
              className="py-2 font-display text-sm font-bold uppercase tracking-widest text-ash hover:text-bone"
            >
              {i.label}
            </Link>
          ))}
          <a
            href={WATCH}
            target="_blank"
            rel="noreferrer"
            className="py-2 font-display text-sm font-bold uppercase tracking-widest text-hellfire"
          >
            Watch ↗
          </a>
        </nav>
      ) : null}
    </header>
  );
}
