/**
 * Live GitHub data with ISR, falling back to the committed snapshots.
 *
 * Rules: never fetch without a token (anonymous rate limits), never fetch when
 * CONTENT_SNAPSHOT_ONLY=1 (CI / e2e), and serve the snapshot on any failure.
 * Server components only.
 */
import { getActivitySnapshot, getRoadmapSnapshot } from "@/lib/content";
import type { ActivityEvent, ActivitySnapshot, RoadmapSnapshot } from "@/lib/content/types";
import { summarizeRoadmapItems } from "@/lib/roadmap-status";

const REPOS = ["shipshitgames/shipshit.games", "shipshitgames/deadrot.com"] as const;
const REVALIDATE_SECONDS = 3600;
const FETCH_TIMEOUT_MS = 5000;

function snapshotOnly(): boolean {
  return process.env.CONTENT_SNAPSHOT_ONLY === "1" || !process.env.GITHUB_TOKEN;
}

async function githubJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      accept: "application/vnd.github+json",
    },
    next: { revalidate: REVALIDATE_SECONDS },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`GitHub ${res.status} for ${url}`);
  return (await res.json()) as T;
}

interface SearchPr {
  number: number;
  title: string;
  html_url: string;
  pull_request?: { merged_at: string | null };
}

interface RepoCommit {
  sha: string;
  html_url: string;
  commit: { message: string; committer: { date: string } | null };
}

/** Merged PRs + recent commits across both repos; snapshot on any failure. */
export async function fetchActivity(): Promise<{ data: ActivitySnapshot; live: boolean }> {
  const snapshot = getActivitySnapshot();
  if (snapshotOnly()) return { data: snapshot, live: false };

  try {
    const events: ActivityEvent[] = [];
    let mergedPrsTotal = 0;
    let commitsLast30d = 0;
    const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

    for (const repo of REPOS) {
      const search = await githubJson<{ total_count: number; items: SearchPr[] }>(
        `https://api.github.com/search/issues?q=${encodeURIComponent(`repo:${repo} is:pr is:merged`)}&sort=updated&order=desc&per_page=25`,
      );
      mergedPrsTotal += search.total_count;
      for (const pr of search.items) {
        if (!pr.pull_request?.merged_at) continue;
        events.push({
          type: "pr_merged",
          repo,
          number: pr.number,
          title: pr.title,
          url: pr.html_url,
          date: pr.pull_request.merged_at,
        });
      }

      const commits = await githubJson<RepoCommit[]>(
        `https://api.github.com/repos/${repo}/commits?per_page=100`,
      );
      commitsLast30d += commits.filter((c) => (c.commit.committer?.date ?? "") >= cutoff).length;
      for (const commit of commits.slice(0, 20)) {
        const message = commit.commit.message.split("\n")[0];
        if (message.startsWith("Merge pull request")) continue;
        events.push({
          type: "commit",
          repo,
          sha: commit.sha.slice(0, 7),
          message,
          url: commit.html_url,
          date: commit.commit.committer?.date ?? "",
        });
      }
    }

    events.sort((a, b) => b.date.localeCompare(a.date));
    return {
      data: {
        generatedAt: new Date().toISOString(),
        events: events.slice(0, 80),
        stats: { ...snapshot.stats, mergedPrsTotal, commitsLast30d },
      },
      live: true,
    };
  } catch {
    return { data: snapshot, live: false };
  }
}

/**
 * Roadmap boards. Live reads need projectsV2 GraphQL, which most fine-grained
 * tokens cannot see — only attempted with the explicit opt-in flag. The
 * committed snapshot (refreshed by every local `sync:content` run) is the
 * normal serving path.
 */
export async function fetchRoadmap(): Promise<{ data: RoadmapSnapshot; live: boolean }> {
  const snapshot = getRoadmapSnapshot();
  if (snapshotOnly() || process.env.GITHUB_TOKEN_HAS_PROJECT_SCOPE !== "1") {
    return { data: snapshot, live: false };
  }

  try {
    const query = `
      query($login: String!) {
        organization(login: $login) {
          projectsV2(first: 20) {
            nodes {
              number title url
              items(first: 100) {
                nodes {
                  fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
                  content { ... on Issue { title } ... on PullRequest { title } ... on DraftIssue { title } }
                }
              }
            }
          }
        }
      }`;
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query, variables: { login: "shipshitgames" } }),
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`GitHub GraphQL ${res.status}`);
    const body = (await res.json()) as {
      data?: {
        organization?: {
          projectsV2?: {
            nodes?: Array<{
              number: number;
              title: string;
              url: string;
              items?: { nodes?: Array<{ fieldValueByName?: { name?: string } | null; content?: { title?: string } | null }> };
            }>;
          };
        };
      };
      errors?: unknown[];
    };
    const nodes = body.data?.organization?.projectsV2?.nodes;
    if (!nodes || body.errors?.length) throw new Error("GraphQL response missing projects");

    const boards = nodes
      .map((project) => {
        let scope: string;
        if (project.title.startsWith("deadrot.com/")) scope = project.title.slice("deadrot.com/".length);
        else if (project.title === "deadrot.com") scope = "deadrot";
        else if (project.title === "shipshit.games") scope = "studio";
        else return null;

        const { counts, topItems } = summarizeRoadmapItems(
          (project.items?.nodes ?? []).map((item) => ({
            status: item.fieldValueByName?.name,
            title: item.content?.title,
          })),
        );
        return {
          scope,
          title: project.title,
          projectNumber: project.number,
          url: project.url,
          counts,
          topItems,
        };
      })
      .filter((b): b is NonNullable<typeof b> => b !== null)
      .sort((a, b) => a.title.localeCompare(b.title));

    if (boards.length === 0) throw new Error("no site-relevant boards in GraphQL response");
    return { data: { generatedAt: new Date().toISOString(), boards }, live: true };
  } catch {
    return { data: snapshot, live: false };
  }
}
