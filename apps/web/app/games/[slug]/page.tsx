import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GAMES } from "@shipshitgames/shared";

import { CharacterRoster } from "@/components/games/character-roster";
import { EnemyBestiary } from "@/components/games/enemy-bestiary";
import { GameBuildPath } from "@/components/games/game-build-path";
import { FactionLinkCard } from "@/components/games/faction-link-card";
import { GameFeatures } from "@/components/games/game-features";
import { GameHero } from "@/components/games/game-hero";
import { GameRoadmap } from "@/components/games/game-roadmap";
import { SpriteGallery } from "@/components/games/sprite-gallery";
import { WatchTheBuild } from "@/components/games/watch-the-build";
import {
  getAssetsForGame,
  getCharacters,
  getCreatures,
  getFaction,
  getGameLore,
} from "@/lib/content";
import { fetchRoadmap } from "@/lib/github";
import { fetchLatestVideos } from "@/lib/youtube";
import { jsonLdString, videoGameJsonLd } from "@/lib/seo";

export const revalidate = 3600;

function getGame(slug: string) {
  return GAMES.find((game) => game.slug === slug);
}

export function generateStaticParams() {
  return GAMES.map((game) => ({ slug: game.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const game = getGame(slug);
  if (!game) return {};

  const lore = getGameLore(slug);
  const description = lore?.tagline ?? game.summary;

  return {
    title: `${game.title} Game Brief`,
    description,
    openGraph: {
      title: `${game.title} - Ship Shit Games`,
      description,
      url: `https://shipshit.games/games/${game.slug}`,
    },
    twitter: {
      card: "summary_large_image",
      title: `${game.title} - Ship Shit Games`,
      description,
    },
  };
}

export default async function GamePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const game = getGame(slug);
  if (!game) notFound();

  const lore = getGameLore(slug);
  const accent = lore?.accent ?? "blood";
  const characters = lore ? getCharacters(lore.characterSlugs) : [];
  const creatures = lore ? getCreatures(lore.enemySlugs) : [];
  const assets = getAssetsForGame(slug);
  const faction = lore?.factionSlug ? getFaction(lore.factionSlug) : null;

  const [roadmap, latest] = await Promise.all([fetchRoadmap(), fetchLatestVideos(3)]);
  const board = roadmap.data.boards.find((b) => b.scope === slug) ?? null;

  return (
    <main>
      <script type="application/ld+json">
        {jsonLdString(videoGameJsonLd(game, lore))}
      </script>

      <GameHero game={game} lore={lore} />
      <GameBuildPath game={game} accent={accent} />
      {lore ? <GameFeatures features={lore.features} accent={accent} /> : null}
      <CharacterRoster characters={characters} accent={accent} />
      <EnemyBestiary creatures={creatures} />
      <SpriteGallery assets={assets} accent={accent} />
      {board ? (
        <GameRoadmap board={board} readinessIssueUrl={game.readinessIssueUrl} accent={accent} />
      ) : null}
      <WatchTheBuild videos={latest.videos} accent={accent} />
      {faction ? <FactionLinkCard faction={faction} /> : null}
    </main>
  );
}
