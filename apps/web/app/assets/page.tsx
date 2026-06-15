import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { GAMES } from "@shipshitgames/shared";

import { Backdrop } from "@/components/site/atmosphere";
import { Eyebrow } from "@/components/site/eyebrow";
import { pageAccent } from "@/components/games/accent";
import { Button } from "@/components/ui/button";
import { AssetBrowser, type GameOption } from "@/components/assets/asset-browser";
import { VariantMatrix } from "@/components/assets/variant-matrix";
import { formatDimensions } from "@/components/assets/asset-meta";
import { CONTENT_MANIFEST, getAssetIndex } from "@/lib/content";

export const metadata: Metadata = {
  title: "Asset Gallery",
  description:
    "A gallery of Ship Shit Games generated thumbnails, portraits, and production-ready game assets.",
  openGraph: {
    title: "Ship Shit Games Asset Gallery",
    description:
      "Generated game thumbnails, faction portraits, and production assets from the Ship Shit Games pipeline.",
    url: "https://shipshit.games/assets",
    images: [
      {
        url: "/images/og/assets.jpg",
        width: 1200,
        height: 630,
        alt: "Ship Shit Games asset gallery",
        type: "image/jpeg",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Ship Shit Games Asset Gallery",
    description:
      "Generated game thumbnails, faction portraits, and production assets from the Ship Shit Games pipeline.",
    images: ["/images/og/assets.jpg"],
  },
};

const GAME_OPTIONS: GameOption[] = GAMES.map((game) => ({
  slug: game.slug,
  title: game.title,
}));

const GAME_TITLES: Record<string, string> = Object.fromEntries(
  GAMES.map((game) => [game.slug, game.title])
);

/** The locked grading pipeline every render passes before it ships. */
const GRADE_LOCKS = [
  "110px grid",
  "DOOM palette lock",
  "ordered dither",
  "lossless WebP",
  "alpha defringe",
] as const;

export default function AssetsPage() {
  const assetIndex = getAssetIndex();
  const { counts } = CONTENT_MANIFEST;

  const covers = assetIndex.filter((entry) => entry.kind === "cover").slice(0, 6);
  const swarmRender = assetIndex.find(
    (entry) => entry.id === "entity:scourge-swarm:scourge-survivors"
  );
  const swarmRuntime = assetIndex.find(
    (entry) => entry.id === "runtime:scourge-survivors:enemy-melee"
  );

  return (
    <main>
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section
        style={pageAccent("hellfire")}
        className="relative overflow-hidden border-b border-gunmetal/40 px-6 pb-20 pt-32"
      >
        <Backdrop />
        <div className="relative z-10 mx-auto max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,0.78fr)_minmax(360px,1fr)] lg:items-center">
            <div>
              <Eyebrow>Assetgen showcase</Eyebrow>
              <h1 className="text-glow mt-5 max-w-4xl font-display text-5xl font-bold uppercase leading-[0.9] tracking-tight text-bone sm:text-7xl">
                Game art, generated for shipping.
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-relaxed text-ash">
                {counts.sprites} production sprites across {counts.games} games, generated in
                canon. Every render is palette-locked to the DOOM ramp, indexed with its
                provenance, and registered where the Deadrot runtime can actually use it —
                {" "}{counts.assets} cataloged assets and counting.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Button asChild size="xl" className="font-display uppercase tracking-widest shadow-ember">
                  <Link href="/pricing">
                    Get Skills Pro
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="xl"
                  variant="outline"
                  className="border-gunmetal font-display uppercase tracking-widest text-bone hover:border-hellfire hover:text-hellfire"
                >
                  <a href="https://docs.shipshit.games/tools/assetgen" target="_blank" rel="noreferrer">
                    Read assetgen docs
                  </a>
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {covers.map((cover, coverIndex) => (
                <div
                  key={cover.id}
                  className="group relative aspect-[1200/630] overflow-hidden rounded-md border border-gunmetal bg-coal"
                >
                  <Image
                    src={cover.publicPath}
                    alt={`${cover.name} generated key art`}
                    fill
                    sizes="(min-width: 1024px) 280px, 50vw"
                    className="object-cover transition duration-500 group-hover:scale-105"
                    priority={coverIndex === 0}
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-void via-void/75 to-transparent p-3">
                    <p className="font-display text-sm font-bold uppercase leading-tight text-bone">
                      {cover.game ? (GAME_TITLES[cover.game] ?? cover.name) : cover.name}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-14 grid gap-px overflow-hidden rounded-md border border-gunmetal bg-gunmetal sm:grid-cols-2 lg:grid-cols-4">
            {[
              { value: counts.assets, label: "Cataloged assets" },
              { value: counts.sprites, label: "Production sprites" },
              { value: counts.games, label: "Game fronts" },
              { value: counts.factions, label: "Factions in canon" },
            ].map((stat) => (
              <div key={stat.label} className="bg-coal px-5 py-5">
                <span className="font-display text-4xl font-bold leading-none text-bone">
                  {stat.value}
                </span>
                <span className="mt-2 block font-display text-xs font-bold uppercase tracking-widest text-hellfire">
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BROWSER ──────────────────────────────────────────────────────── */}
      <section style={pageAccent("blood")} className="border-b border-gunmetal/40 px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <Eyebrow>The armory</Eyebrow>
              <h2 className="mt-3 font-display text-4xl font-bold uppercase tracking-tight text-bone sm:text-5xl">
                Browse every asset
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-relaxed text-ash">
              The full committed index: cross-game entity renders, runtime sprites,
              faction portraits, and covers. Filter by game, kind, or faction —
              click any card for pixel-perfect preview and provenance.
            </p>
          </div>

          <div className="mt-10">
            <AssetBrowser assets={assetIndex} games={GAME_OPTIONS} gameTitles={GAME_TITLES} />
          </div>
        </div>
      </section>

      {/* ── VARIANT MATRIX ───────────────────────────────────────────────── */}
      <section
        style={pageAccent("rust")}
        className="relative overflow-hidden border-b border-gunmetal/40 px-6 py-20"
      >
        <Backdrop />
        <div className="relative z-10 mx-auto max-w-7xl">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <Eyebrow>One entity, every front</Eyebrow>
              <h2 className="mt-3 font-display text-4xl font-bold uppercase tracking-tight text-bone sm:text-5xl">
                Same canon, new camera
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-relaxed text-ash">
              One canon entity, re-rendered for each game&apos;s camera and art
              direction: FPS billboards for Scourge Survivors, top-down lane reads
              for Deadlane, battlefield silhouettes for Pactfall.
            </p>
          </div>

          <div className="mt-10">
            <VariantMatrix assets={assetIndex} gameTitles={GAME_TITLES} />
          </div>
        </div>
      </section>

      {/* ── PROCESS: PROMPT → RENDER → GRADE → SHIP ─────────────────────── */}
      <section style={pageAccent("hellfire")} className="px-6 py-20">
        <div className="mx-auto max-w-7xl">
          <Eyebrow>The pipeline</Eyebrow>
          <h2 className="mt-3 font-display text-4xl font-bold uppercase tracking-tight text-bone sm:text-5xl">
            Prompt → Render → Grade → Ship
          </h2>
          <p className="mt-5 max-w-2xl leading-relaxed text-ash">
            The same entity, walked through the real pipeline. This is the Swarm
            Ripper — Scourge fodder — from canon prompt to registered runtime sprite.
          </p>

          <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {/* 01 Prompt */}
            <div className="flex flex-col rounded-md border border-gunmetal bg-coal p-6">
              <span className="font-display text-sm font-bold uppercase tracking-widest text-hellfire">
                01 · Prompt
              </span>
              <h3 className="mt-3 font-display text-xl font-bold uppercase tracking-tight text-bone">
                Written in canon
              </h3>
              {swarmRender?.promptBase ? (
                <blockquote className="mt-4 flex-1 rounded-md border border-gunmetal bg-void p-4 font-mono text-xs leading-relaxed text-ash">
                  “{swarmRender.promptBase}”
                </blockquote>
              ) : (
                <p className="mt-4 flex-1 text-sm leading-relaxed text-ash">
                  Every render starts from the entity&apos;s canon prompt base —
                  faction rules, host family, palette constraints.
                </p>
              )}
              <p className="mt-3 font-mono text-[11px] uppercase tracking-widest text-ash">
                prompt base · scourge-swarm
              </p>
            </div>

            {/* 02 Render */}
            <div className="flex flex-col rounded-md border border-gunmetal bg-coal p-6">
              <span className="font-display text-sm font-bold uppercase tracking-widest text-hellfire">
                02 · Render
              </span>
              <h3 className="mt-3 font-display text-xl font-bold uppercase tracking-tight text-bone">
                Per-game variant
              </h3>
              {swarmRender ? (
                <div className="mt-4 flex flex-1 items-center justify-center rounded-md border border-gunmetal bg-void p-4">
                  <Image
                    src={swarmRender.publicPath}
                    alt="Swarm Ripper rendered for Scourge Survivors"
                    width={swarmRender.dimensions?.[0] ?? 256}
                    height={swarmRender.dimensions?.[1] ?? 256}
                    sizes="10rem"
                    unoptimized
                    className="max-h-40 [image-rendering:pixelated]"
                  />
                </div>
              ) : null}
              <p className="mt-3 font-mono text-[11px] uppercase tracking-widest text-ash">
                scourge-survivors front
                {swarmRender?.dimensions
                  ? ` · ${formatDimensions(swarmRender.dimensions)}`
                  : null}
              </p>
            </div>

            {/* 03 Grade */}
            <div className="flex flex-col rounded-md border border-gunmetal bg-coal p-6">
              <span className="font-display text-sm font-bold uppercase tracking-widest text-hellfire">
                03 · Grade
              </span>
              <h3 className="mt-3 font-display text-xl font-bold uppercase tracking-tight text-bone">
                Locked pipeline
              </h3>
              <ul className="mt-4 flex-1 space-y-2">
                {GRADE_LOCKS.map((lock) => (
                  <li
                    key={lock}
                    className="border-l border-hellfire/60 pl-3 font-mono text-xs uppercase tracking-widest text-ash"
                  >
                    {lock}
                  </li>
                ))}
              </ul>
              <p className="mt-3 font-mono text-[11px] uppercase tracking-widest text-ash">
                no anti-aliasing survives
              </p>
            </div>

            {/* 04 Ship */}
            <div className="flex flex-col rounded-md border border-gunmetal bg-coal p-6">
              <span className="font-display text-sm font-bold uppercase tracking-widest text-hellfire">
                04 · Ship
              </span>
              <h3 className="mt-3 font-display text-xl font-bold uppercase tracking-tight text-bone">
                Into the runtime
              </h3>
              {swarmRuntime ? (
                <div className="mt-4 flex flex-1 items-center justify-center rounded-md border border-gunmetal bg-void p-4">
                  <Image
                    src={swarmRuntime.publicPath}
                    alt="Swarm Ripper runtime sprite in the Scourge Survivors build"
                    width={swarmRuntime.dimensions?.[0] ?? 256}
                    height={swarmRuntime.dimensions?.[1] ?? 256}
                    sizes="10rem"
                    unoptimized
                    className="max-h-40 [image-rendering:pixelated]"
                  />
                </div>
              ) : null}
              <p className="mt-3 font-mono text-[11px] uppercase tracking-widest text-ash">
                registered in the Deadrot asset package
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
