import Link from "next/link";
import { BookOpen, ClipboardCheck, Code2, ExternalLink, Gamepad2, MonitorPlay } from "lucide-react";
import type { Game } from "@shipshitgames/shared";

import { Eyebrow } from "@/components/site/eyebrow";
import { Button } from "@/components/ui/button";
import { accentStyle } from "@/components/games/accent";
import { PlayBuildLink } from "@/components/games/play-build-link";
import { StatusBadge } from "@/components/games/status-badge";
import type { AccentToken } from "@/lib/content/types";

const SKILLS_URL = "https://github.com/shipshitgames/skills";

export function GameBuildPath({
  game,
  accent,
}: {
  game: Game;
  accent: AccentToken;
}) {
  return (
    <section style={accentStyle(accent)} className="border-b border-gunmetal/40 px-6 py-20">
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,0.62fr)]">
        <div>
          <Eyebrow>Build path</Eyebrow>
          <h2 className="mt-3 max-w-3xl font-display text-4xl font-bold uppercase tracking-tight text-bone sm:text-5xl">
            Play the build, then inspect the work.
          </h2>
          <p className="mt-5 max-w-2xl leading-relaxed text-ash">
            Runtime code and shipped game assets stay in the Deadrot repo. This
            page deep-links to the playable build, source branch, skill library,
            Ship Shit Show archive, and finished-product gate without copying the
            game into the studio site.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="font-display uppercase tracking-widest shadow-ember">
              <PlayBuildLink href={game.playUrl} game={game.slug} location="game_build_path">
                <Gamepad2 aria-hidden="true" />
                Play on Deadrot
              </PlayBuildLink>
            </Button>
            {game.demoUrl ? (
              <Button asChild size="lg" variant="outline" className="font-display uppercase tracking-widest">
                <a href={game.demoUrl} target="_blank" rel="noreferrer">
                  <MonitorPlay aria-hidden="true" />
                  Live Vercel build
                </a>
              </Button>
            ) : null}
            <Button asChild size="lg" variant="outline" className="font-display uppercase tracking-widest">
              <a href={game.repoUrl} target="_blank" rel="noreferrer">
                <Code2 aria-hidden="true" />
                Source repo
              </a>
            </Button>
          </div>
        </div>

        <aside className="rounded-md border border-gunmetal bg-coal p-6">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={game.status} />
            <span className="font-display text-xs font-bold uppercase tracking-widest text-[var(--accent)]">
              Finished gate
            </span>
          </div>

          <ul className="mt-6 space-y-3">
            {game.proofPoints.map((point) => (
              <li key={point} className="flex gap-3 text-sm leading-relaxed text-ash">
                <ClipboardCheck className="mt-0.5 size-4 shrink-0 text-[var(--accent)]" aria-hidden="true" />
                <span>{point}</span>
              </li>
            ))}
          </ul>

          <div className="mt-7 grid gap-2 sm:grid-cols-2">
            <Button asChild size="sm" variant="outline" className="font-display uppercase tracking-widest">
              <a href={game.readinessIssueUrl} target="_blank" rel="noreferrer">
                <ClipboardCheck aria-hidden="true" />
                Finished gate
              </a>
            </Button>
            <Button asChild size="sm" variant="outline" className="font-display uppercase tracking-widest">
              <a href={SKILLS_URL} target="_blank" rel="noreferrer">
                <BookOpen aria-hidden="true" />
                Skills library
              </a>
            </Button>
            <Button asChild size="sm" variant="outline" className="font-display uppercase tracking-widest sm:col-span-2">
              <Link href="/youtube">
                <ExternalLink aria-hidden="true" />
                Built live on Ship Shit Show
              </Link>
            </Button>
          </div>
        </aside>
      </div>
    </section>
  );
}
