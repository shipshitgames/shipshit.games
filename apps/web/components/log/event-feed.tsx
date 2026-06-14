/**
 * Terminal-styled activity feed primitives shared by /log and the home
 * "Latest shipped" strip. Server-safe — no hooks, no client APIs.
 */
import type { ActivityEvent } from "@/lib/content/types";
import { repoLabel, utcTime } from "./event-feed-utils";

/** Type glyph: [PR] burns hellfire, [commit] stays ash. */
export function EventGlyph({ type }: { type: ActivityEvent["type"] }) {
  return type === "pr_merged" ? (
    <span className="shrink-0 font-bold text-hellfire">[PR]</span>
  ) : (
    <span className="shrink-0 text-ash">[commit]</span>
  );
}

/** One terminal log line: glyph, linked title, repo tag, short ref. */
export function EventRow({ event }: { event: ActivityEvent }) {
  const title = event.type === "pr_merged" ? event.title : event.message;
  const ref = event.type === "pr_merged" ? `#${event.number}` : event.sha;
  return (
    <li
      data-testid="log-event"
      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-gunmetal/30 px-4 py-2.5 font-mono text-sm leading-snug last:border-b-0"
    >
      <span className="shrink-0 text-xs text-ash/60">{utcTime(event.date)}</span>
      <EventGlyph type={event.type} />
      <a
        href={event.url}
        target="_blank"
        rel="noreferrer"
        className="min-w-0 flex-1 basis-64 truncate text-bone transition-colors hover:text-hellfire"
        title={title}
      >
        {title}
      </a>
      <span className="shrink-0 text-xs uppercase tracking-wider text-rust">
        {repoLabel(event.repo)}
      </span>
      <span className="shrink-0 text-xs text-ash/70">{ref}</span>
    </li>
  );
}
