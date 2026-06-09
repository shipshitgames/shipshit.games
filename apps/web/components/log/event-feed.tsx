/**
 * Terminal-styled activity feed primitives shared by /log and the home
 * "Latest shipped" strip. Server-safe — no hooks, no client APIs.
 */
import type { ActivityEvent } from "@/lib/content/types";

const REPO_LABELS: Record<string, string> = {
  "shipshitgames/shipshit.games": "shipshit.games",
  "shipshitgames/deadrot.com": "deadrot.com",
};

/** Short site-facing tag for a GitHub repo full name. */
export function repoLabel(repo: string): string {
  return REPO_LABELS[repo] ?? repo.split("/").pop() ?? repo;
}

/** UTC calendar day (YYYY-MM-DD) for an ISO event date. */
export function utcDay(date: string): string {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date.slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

/** UTC clock time (HH:MM) for an ISO event date. */
export function utcTime(date: string): string {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "--:--";
  return parsed.toISOString().slice(11, 16);
}

export interface DayGroup {
  day: string;
  events: ActivityEvent[];
}

/** Group events by UTC day, preserving the incoming (newest-first) order. */
export function groupEventsByDay(events: ActivityEvent[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const event of events) {
    const day = utcDay(event.date);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.events.push(event);
    else groups.push({ day, events: [event] });
  }
  return groups;
}

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
