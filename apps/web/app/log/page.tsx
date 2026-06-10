import type { Metadata } from "next";

import { Backdrop } from "@/components/site/atmosphere";
import { Breadcrumbs } from "@/components/site/breadcrumbs";
import { Eyebrow } from "@/components/site/eyebrow";
import { EventRow, groupEventsByDay, utcDay } from "@/components/log/event-feed";
import { fetchActivity } from "@/lib/github";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Build Log",
  description:
    "The raw shipping record of Ship Shit Games: merged PRs and commits across the studio and DEADROT repos, straight from GitHub.",
  openGraph: {
    title: "Ship Shit Games Build Log",
    description:
      "Merged PRs and commits across shipshit.games and deadrot.com — the studio terminal, in public.",
    url: "https://shipshit.games/log",
  },
};

export default async function LogPage() {
  const { data, live } = await fetchActivity();
  const days = groupEventsByDay(data.events);
  const prCount = data.events.filter((e) => e.type === "pr_merged").length;

  return (
    <main>
      <section className="relative overflow-hidden border-b border-gunmetal/40 px-6 pb-12 pt-32">
        <Backdrop />
        <div className="relative z-10 mx-auto max-w-5xl">
          <Breadcrumbs
            items={[
              { name: "Home", href: "/" },
              { name: "Build log", href: "/log" },
            ]}
          />
          <div className="mt-8">
            <Eyebrow>Build log</Eyebrow>
            <h1 className="text-glow mt-5 max-w-3xl font-display text-5xl font-bold uppercase leading-[0.9] tracking-tight text-bone sm:text-6xl">
              Every ship leaves a trail.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ash">
              Merged pull requests and commits across the studio and DEADROT
              repos — the unedited record of the build, pulled from GitHub.
            </p>
            <p className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-sm text-ash">
              <span>
                <span className="font-bold text-bone">{data.events.length}</span> events
              </span>
              <span className="text-gunmetal">/</span>
              <span>
                <span className="font-bold text-hellfire">{data.stats.mergedPrsTotal}</span>{" "}
                PRs merged all-time
              </span>
              <span className="text-gunmetal">/</span>
              <span>
                <span className="font-bold text-bone">{prCount}</span> merges in this window
              </span>
            </p>
            {!live ? (
              <p
                data-testid="snapshot-notice"
                className="mt-3 font-mono text-xs text-ash/60"
              >
                snapshot from {utcDay(data.generatedAt)} — live feed resumes on next sync
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="px-6 py-14">
        <div className="mx-auto max-w-5xl">
          <div className="hud-frame overflow-hidden rounded-md bg-void">
            <div className="flex items-center gap-2 border-b border-gunmetal/60 bg-coal px-4 py-2.5 font-mono text-xs text-ash">
              <span aria-hidden className="size-2 rounded-full bg-blood" />
              <span aria-hidden className="size-2 rounded-full bg-hellfire" />
              <span aria-hidden className="size-2 rounded-full bg-gunmetal" />
              <span className="ml-2 uppercase tracking-widest">
                shipshitgames · activity feed
              </span>
            </div>
            {days.map((group) => (
              <section key={group.day} aria-label={`Activity on ${group.day}`}>
                <h2
                  data-testid="log-day"
                  className="border-b border-gunmetal/60 bg-coal/60 px-4 py-2 font-display text-sm font-bold uppercase tracking-[0.25em] text-hellfire"
                >
                  {group.day}
                </h2>
                <ul>
                  {group.events.map((event) => (
                    <EventRow
                      key={
                        event.type === "pr_merged"
                          ? `pr-${event.repo}-${event.number}`
                          : `commit-${event.repo}-${event.sha}`
                      }
                      event={event}
                    />
                  ))}
                </ul>
              </section>
            ))}
            <p className="px-4 py-3 font-mono text-xs text-ash/60">
              <span className="text-hellfire">$</span> end of window — full history lives
              on{" "}
              <a
                href="https://github.com/shipshitgames"
                target="_blank"
                rel="noreferrer"
                className="text-ash underline decoration-gunmetal underline-offset-2 transition-colors hover:text-bone"
              >
                github.com/shipshitgames
              </a>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
