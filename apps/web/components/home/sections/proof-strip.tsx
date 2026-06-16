import Link from "next/link";

import { Eyebrow } from "@/components/site/eyebrow";
import { PageSection } from "@/components/site/page-section";
import { EventGlyph } from "@/components/log/event-feed";
import { utcDay } from "@/components/log/event-feed-utils";
import { CONTENT_MANIFEST, getActivitySnapshot } from "@/lib/content";

const ACTIVITY = getActivitySnapshot();
const LATEST_SHIPPED = ACTIVITY.events.slice(0, 4);

const STUDIO_SIGNALS = [
  {
    value: CONTENT_MANIFEST.counts.games,
    label: "Game tracks",
    body: "Public DEADROT builds with playable links, source, and readiness gates.",
  },
  {
    value: CONTENT_MANIFEST.counts.sprites,
    label: "Production sprites",
    body: "Canon pixel assets synced straight from the live asset catalog.",
  },
  {
    value: ACTIVITY.stats.mergedPrsTotal,
    label: "PRs shipped",
    body: "Merged pull requests across the studio and DEADROT repos, all-time.",
  },
  {
    value: ACTIVITY.stats.commitsLast30d,
    label: "Commits / 30 days",
    body: "Commit pressure across both repos in the last thirty days.",
  },
] as const;

export function ProofStrip() {
  return (
    <PageSection
      accent="rust"
      className="relative overflow-hidden border-t border-gunmetal/40 bg-void px-6 py-10"
    >
      <div
        data-testid="stats-strip"
        className="mx-auto grid max-w-7xl gap-px overflow-hidden rounded-md border border-gunmetal bg-gunmetal md:grid-cols-4"
      >
        {STUDIO_SIGNALS.map((signal) => (
          <div key={signal.label} className="bg-coal px-5 py-6">
            <div className="flex items-end gap-3">
              <span
                data-testid="stat-value"
                className="font-display text-5xl font-bold leading-none text-bone"
              >
                {signal.value}
              </span>
              <span className="pb-1 font-display text-xs font-bold uppercase tracking-widest text-hellfire">
                {signal.label}
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-ash">{signal.body}</p>
          </div>
        ))}
      </div>

      {/* -- LATEST SHIPPED ------------------------------------------------ */}
      <div className="mx-auto mt-6 max-w-7xl">
        <div className="hud-frame overflow-hidden rounded-md bg-void/80">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gunmetal/60 bg-coal/70 px-4 py-2">
            <span className="font-mono text-xs uppercase tracking-widest text-ash">
              <span className="text-hellfire">$</span> latest shipped
            </span>
            <Link
              href="/log"
              className="font-display text-xs font-bold uppercase tracking-widest text-hellfire transition-colors hover:text-blood"
            >
              Full build log →
            </Link>
          </div>
          <ul data-testid="latest-shipped">
            {LATEST_SHIPPED.map((event) => (
              <li
                key={event.url}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-gunmetal/30 px-4 py-2 font-mono text-sm last:border-b-0"
              >
                <EventGlyph type={event.type} />
                <a
                  href={event.url}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 basis-64 truncate text-bone transition-colors hover:text-hellfire"
                >
                  {event.type === "pr_merged" ? event.title : event.message}
                </a>
                <span className="shrink-0 text-xs text-ash/70">{utcDay(event.date)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </PageSection>
  );
}
