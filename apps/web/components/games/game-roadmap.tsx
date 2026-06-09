import { ClipboardCheck, ExternalLink } from "lucide-react";

import { Eyebrow } from "@/components/site/eyebrow";
import { Button } from "@/components/ui/button";
import { accentStyle } from "@/components/games/accent";
import type { AccentToken, RoadmapBoard } from "@/lib/content/types";

const COUNTS: { key: keyof RoadmapBoard["counts"]; label: string }[] = [
  { key: "todo", label: "Todo" },
  { key: "inProgress", label: "In Progress" },
  { key: "done", label: "Done" },
];

/** Live-ish board state for the game: big counts, the open work, board link-outs. */
export function GameRoadmap({
  board,
  readinessIssueUrl,
  accent,
}: {
  board: RoadmapBoard;
  readinessIssueUrl: string;
  accent: AccentToken;
}) {
  return (
    <section style={accentStyle(accent)} className="border-b border-gunmetal/40 px-6 py-20">
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)]">
        <div>
          <Eyebrow>Roadmap</Eyebrow>
          <h2 className="mt-3 font-display text-4xl font-bold uppercase tracking-tight text-bone sm:text-5xl">
            The board is public.
          </h2>
          <p className="mt-5 max-w-xl leading-relaxed text-ash">
            Every slice of this build is tracked on the open project board. The
            counts below come straight from it — no marketing math.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="font-display uppercase tracking-widest shadow-ember">
              <a href={board.url} target="_blank" rel="noreferrer">
                Open board
                <ExternalLink aria-hidden="true" />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline" className="font-display uppercase tracking-widest">
              <a href={readinessIssueUrl} target="_blank" rel="noreferrer">
                <ClipboardCheck aria-hidden="true" />
                Readiness issue
              </a>
            </Button>
          </div>
        </div>

        <div>
          <div
            data-testid="roadmap-counts"
            className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-gunmetal bg-gunmetal"
          >
            {COUNTS.map(({ key, label }) => (
              <div key={key} className="bg-coal px-5 py-6">
                <span className="block font-display text-5xl font-bold leading-none text-bone">
                  {board.counts[key]}
                </span>
                <span className="mt-3 block font-display text-xs font-bold uppercase tracking-widest text-[var(--accent)]">
                  {label}
                </span>
              </div>
            ))}
          </div>

          {board.topItems.length > 0 ? (
            <ul className="mt-4 divide-y divide-gunmetal/60 rounded-md border border-gunmetal bg-coal">
              {board.topItems.map((item) => (
                <li key={item.title} className="flex items-center gap-3 px-5 py-3">
                  <span
                    className={`shrink-0 rounded-md border px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-widest ${
                      item.status === "In Progress"
                        ? "border-hellfire/60 bg-hellfire/10 text-hellfire"
                        : "border-gunmetal bg-void text-ash"
                    }`}
                  >
                    {item.status}
                  </span>
                  <span className="truncate font-mono text-sm text-ash">{item.title}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </section>
  );
}
