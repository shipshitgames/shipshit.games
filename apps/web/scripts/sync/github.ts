import { execFileSync } from "node:child_process";

import type {
  ActivityEvent,
  ActivitySnapshot,
  RoadmapBoard,
  RoadmapSnapshot,
  RoadmapStatus,
} from "../../lib/content/types";

const OWNER = "shipshitgames";
const REPOS = ["shipshitgames/shipshit.games", "shipshitgames/deadrot.com"] as const;

function gh(args: string[]): string {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}

function normalizeStatus(status: unknown): RoadmapStatus {
  if (status === "Todo" || status === "In Progress" || status === "Done") return status;
  return "Other";
}

/** Snapshot every deadrot.com/* game board plus the org-level boards. */
export function snapshotRoadmap(now: string): RoadmapSnapshot {
  const projects = JSON.parse(gh(["project", "list", "--owner", OWNER, "--format", "json"])) as {
    projects: { number: number; title: string; url: string }[];
  };

  const boards: RoadmapBoard[] = [];
  for (const project of projects.projects) {
    let scope: RoadmapBoard["scope"];
    if (project.title.startsWith("deadrot.com/")) scope = project.title.slice("deadrot.com/".length);
    else if (project.title === "deadrot.com") scope = "deadrot";
    else if (project.title === "shipshit.games") scope = "studio";
    else continue; // Lore, Skills, … — not site-relevant.

    const items = JSON.parse(
      gh(["project", "item-list", String(project.number), "--owner", OWNER, "--format", "json", "--limit", "200"]),
    ) as { items: { status?: string; title?: string }[] };

    const counts = { todo: 0, inProgress: 0, done: 0 };
    const open: { title: string; status: RoadmapStatus }[] = [];
    for (const item of items.items) {
      const status = normalizeStatus(item.status);
      if (status === "Todo") counts.todo += 1;
      if (status === "In Progress") counts.inProgress += 1;
      if (status === "Done") counts.done += 1;
      if ((status === "Todo" || status === "In Progress") && typeof item.title === "string") {
        open.push({ title: item.title, status });
      }
    }
    open.sort((a, b) => (a.status === b.status ? 0 : a.status === "In Progress" ? -1 : 1));

    boards.push({
      scope,
      title: project.title,
      projectNumber: project.number,
      url: project.url,
      counts,
      topItems: open.slice(0, 5),
    });
  }

  boards.sort((a, b) => a.title.localeCompare(b.title));
  return { generatedAt: now, boards };
}

/** Snapshot merged PRs + recent commits for both repos. */
export function snapshotActivity(
  now: string,
  stats: { gameCount: number; spriteCount: number },
): ActivitySnapshot {
  const events: ActivityEvent[] = [];
  let mergedPrsTotal = 0;
  let commitsLast30d = 0;
  const cutoff = new Date(new Date(now).getTime() - 30 * 24 * 3600 * 1000).toISOString();

  for (const repo of REPOS) {
    const search = JSON.parse(
      gh([
        "api",
        "-X",
        "GET",
        "search/issues",
        "-f",
        `q=repo:${repo} is:pr is:merged`,
        "-f",
        "sort=updated",
        "-f",
        "order=desc",
        "-F",
        "per_page=25",
        "--jq",
        '{total: .total_count, items: [.items[] | {number, title, url: .html_url, mergedAt: .pull_request.merged_at}]}',
      ]),
    ) as { total: number; items: { number: number; title: string; url: string; mergedAt: string | null }[] };
    mergedPrsTotal += search.total;
    for (const pr of search.items) {
      if (!pr.mergedAt) continue;
      events.push({ type: "pr_merged", repo, number: pr.number, title: pr.title, url: pr.url, date: pr.mergedAt });
    }

    const commits = JSON.parse(
      gh([
        "api",
        "-X",
        "GET",
        `repos/${repo}/commits`,
        "-F",
        "per_page=100",
        "--jq",
        '[.[] | {sha: .sha[0:7], message: (.commit.message | split("\n")[0]), url: .html_url, date: .commit.committer.date}]',
      ]),
    ) as { sha: string; message: string; url: string; date: string }[];
    commitsLast30d += commits.filter((c) => c.date >= cutoff).length;
    // Merge commits duplicate the PR events; keep direct commits only.
    for (const commit of commits.slice(0, 20)) {
      if (/^Merge pull request/.test(commit.message)) continue;
      events.push({ type: "commit", repo, ...commit });
    }
  }

  events.sort((a, b) => b.date.localeCompare(a.date));
  return {
    generatedAt: now,
    events: events.slice(0, 80),
    stats: { ...stats, mergedPrsTotal, commitsLast30d },
  };
}
