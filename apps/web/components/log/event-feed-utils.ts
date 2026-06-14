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
