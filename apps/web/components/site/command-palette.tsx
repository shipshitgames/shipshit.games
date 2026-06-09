"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  ArrowUpRight,
  BookOpen,
  Flame,
  Gamepad2,
  GitBranch,
  PanelTop,
  Skull,
} from "lucide-react";

import { GAMES } from "@shipshitgames/shared";
import { trackEvent } from "@/lib/analytics";

/** Dispatch this on `window` to open the palette from anywhere (e.g. the ⌘K header hint). */
export const PALETTE_OPEN_EVENT = "shipshit:open-palette";

const FACTIONS = [
  { label: "The Pyre", href: "/factions/the-pyre" },
  { label: "The Wardens", href: "/factions/the-wardens" },
  { label: "The Listeners", href: "/factions/the-listeners" },
  { label: "The Scourge", href: "/factions/scourge" },
] as const;

const PAGES = [
  { label: "Home", href: "/" },
  { label: "Games", href: "/games" },
  { label: "Factions", href: "/factions" },
  { label: "Assets", href: "/assets" },
  { label: "Build Log", href: "/log" },
  { label: "Videos", href: "/youtube" },
  { label: "Studio Pass", href: "/pricing" },
] as const;

const EXTERNAL = [
  { label: "Play DEADROT", href: "https://deadrot.com", icon: Skull },
  { label: "GitHub", href: "https://github.com/shipshitgames", icon: GitBranch },
  { label: "Docs", href: "https://docs.shipshit.games", icon: BookOpen },
] as const;

const GROUP_CLASS =
  "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:font-display [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-ash/80";

const ITEM_CLASS =
  "flex cursor-pointer select-none items-center gap-3 rounded-md px-3 py-2 text-sm text-ash data-[selected=true]:bg-iron data-[selected=true]:text-hellfire";

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const openPalette = useCallback(() => {
    setOpen((prev) => {
      if (!prev) trackEvent("palette_open");
      return true;
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => {
          if (!prev) trackEvent("palette_open");
          return !prev;
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(PALETTE_OPEN_EVENT, openPalette);
    // Hydration marker so tests (and the ⌘K hint) know the listener is live.
    document.body.dataset.paletteReady = "true";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(PALETTE_OPEN_EVENT, openPalette);
      delete document.body.dataset.paletteReady;
    };
  }, [openPalette]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  const goExternal = useCallback((href: string) => {
    setOpen(false);
    window.open(href, "_blank", "noopener,noreferrer");
  }, []);

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      overlayClassName="fixed inset-0 z-50 bg-void/80 backdrop-blur-sm"
      contentClassName="fixed left-1/2 top-[18vh] z-50 w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-md border border-gunmetal bg-coal text-bone shadow-[0_0_0_1px_rgba(0,0,0,0.6),0_24px_64px_-16px_rgba(0,0,0,0.9)]"
      className="w-full"
    >
      <Command.Input
        placeholder="Search games, factions, pages…"
        className="w-full border-b border-gunmetal bg-transparent px-4 py-3.5 font-mono text-sm text-bone outline-none placeholder:text-ash/60"
      />
      <Command.List className="max-h-[55vh] overflow-y-auto p-2 pb-3">
        <Command.Empty className="px-4 py-8 text-center font-mono text-xs uppercase tracking-widest text-ash">
          No signal. Nothing matches.
        </Command.Empty>

        <Command.Group heading="Games" className={GROUP_CLASS}>
          {GAMES.map((game) => (
            <Command.Item
              key={game.slug}
              value={`game ${game.title}`}
              onSelect={() => go(`/games/${game.slug}`)}
              className={ITEM_CLASS}
            >
              <Gamepad2 className="size-4 shrink-0" aria-hidden="true" />
              <span className="text-bone">{game.title}</span>
              <span className="ml-auto truncate font-mono text-[0.65rem] uppercase tracking-widest text-ash/60">
                {game.genre}
              </span>
            </Command.Item>
          ))}
        </Command.Group>

        <Command.Group heading="Factions" className={GROUP_CLASS}>
          {FACTIONS.map((faction) => (
            <Command.Item
              key={faction.href}
              value={`faction ${faction.label}`}
              onSelect={() => go(faction.href)}
              className={ITEM_CLASS}
            >
              <Flame className="size-4 shrink-0" aria-hidden="true" />
              <span className="text-bone">{faction.label}</span>
            </Command.Item>
          ))}
        </Command.Group>

        <Command.Group heading="Pages" className={GROUP_CLASS}>
          {PAGES.map((pageItem) => (
            <Command.Item
              key={pageItem.href}
              value={`page ${pageItem.label}`}
              onSelect={() => go(pageItem.href)}
              className={ITEM_CLASS}
            >
              <PanelTop className="size-4 shrink-0" aria-hidden="true" />
              <span className="text-bone">{pageItem.label}</span>
              <span className="ml-auto font-mono text-[0.65rem] tracking-widest text-ash/60">
                {pageItem.href}
              </span>
            </Command.Item>
          ))}
        </Command.Group>

        <Command.Group heading="External" className={GROUP_CLASS}>
          {EXTERNAL.map((ext) => {
            const Icon = ext.icon;
            return (
              <Command.Item
                key={ext.href}
                value={`external ${ext.label}`}
                onSelect={() => goExternal(ext.href)}
                className={ITEM_CLASS}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="text-bone">{ext.label}</span>
                <ArrowUpRight
                  className="ml-auto size-3.5 text-ash/60"
                  aria-hidden="true"
                />
              </Command.Item>
            );
          })}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
