"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

import { cn } from "@/lib/utils";

const NAV = [
  { label: "Problem", href: "/#problem" },
  { label: "Solution", href: "/#solution" },
  { label: "Products", href: "/#products" },
  { label: "Skills", href: "/#skills" },
  { label: "Newsletter", href: "/#newsletter" },
  { label: "Docs", href: "https://docs.shipshit.games" },
  { label: "Play", href: "https://deadrot.com" },
];

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
          className="flex items-center gap-3 font-display text-lg font-bold uppercase text-bone"
          aria-label="Ship Shit Games home"
        >
          <img
            src="/brand/avatar.png"
            alt=""
            aria-hidden="true"
            className="h-9 w-9 border border-gunmetal bg-void object-cover"
          />
          <span className="hidden sm:inline">
            Ship <span className="text-blood">Shit</span> Games
          </span>
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
        </nav>
      ) : null}
    </header>
  );
}
