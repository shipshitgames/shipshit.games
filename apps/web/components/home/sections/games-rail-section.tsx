import Link from "next/link";
import { GAMES } from "@shipshitgames/shared";

import { Eyebrow } from "@/components/site/eyebrow";
import { PageSection } from "@/components/site/page-section";
import { GameRailCard } from "@/components/home/game-rail-card";
import { GamesRail } from "@/components/home/games-rail";

export function GamesRailSection() {
  return (
    <PageSection
      accent="hellfire"
      className="relative overflow-hidden border-t border-gunmetal/40 px-6 py-14"
    >
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>The games</Eyebrow>
            <h2 className="mt-3 font-display text-3xl font-bold uppercase tracking-tight text-bone sm:text-4xl">
              Seven tracks. One war.
            </h2>
          </div>
          <Link
            href="/games"
            className="font-display text-xs font-bold uppercase tracking-widest text-hellfire transition-colors hover:text-blood"
          >
            All games →
          </Link>
        </div>
        <div className="mt-8">
          <GamesRail>
            {GAMES.map((game) => (
              <GameRailCard key={game.slug} game={game} />
            ))}
          </GamesRail>
        </div>
      </div>
    </PageSection>
  );
}
