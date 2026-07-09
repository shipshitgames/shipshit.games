import type {
  CanonicalRoadmapStatus,
  RoadmapCounts,
  RoadmapStatus,
} from "./content/types";

export type RoadmapCountKey = keyof Required<RoadmapCounts>;

export const ROADMAP_COUNT_CATEGORIES: ReadonlyArray<{
  key: RoadmapCountKey;
  label: CanonicalRoadmapStatus;
}> = [
  { key: "todo", label: "Backlog" },
  { key: "inProgress", label: "In Progress" },
  { key: "humanReview", label: "Human Review" },
  { key: "done", label: "Done" },
  { key: "deferred", label: "Deferred" },
];

export function normalizeRoadmapStatus(status: unknown): RoadmapStatus {
  if (status === "Todo" || status === "Backlog") return "Backlog";
  if (
    status === "In Progress" ||
    status === "Human Review" ||
    status === "Done" ||
    status === "Deferred"
  ) {
    return status;
  }
  return "Other";
}

export function roadmapStatusLabel(status: RoadmapStatus): string {
  return status === "Todo" ? "Backlog" : status;
}

export function roadmapCount(counts: RoadmapCounts, key: RoadmapCountKey): number {
  return counts[key] ?? 0;
}

export interface RoadmapItemInput {
  status?: unknown;
  title?: unknown;
}

const ACTIONABLE_STATUS_ORDER: Partial<Record<RoadmapStatus, number>> = {
  "Human Review": 0,
  "In Progress": 1,
  Backlog: 2,
};

export function summarizeRoadmapItems(items: readonly RoadmapItemInput[]): {
  counts: Required<RoadmapCounts>;
  topItems: { title: string; status: RoadmapStatus }[];
} {
  const counts: Required<RoadmapCounts> = {
    todo: 0,
    inProgress: 0,
    humanReview: 0,
    done: 0,
    deferred: 0,
  };
  const actionable: { title: string; status: RoadmapStatus; order: number }[] = [];

  for (const item of items) {
    const status = normalizeRoadmapStatus(item.status);
    if (status === "Backlog") counts.todo += 1;
    else if (status === "In Progress") counts.inProgress += 1;
    else if (status === "Human Review") counts.humanReview += 1;
    else if (status === "Done") counts.done += 1;
    else if (status === "Deferred") counts.deferred += 1;

    if (typeof item.title !== "string") continue;
    const order = ACTIONABLE_STATUS_ORDER[status];
    if (order !== undefined) actionable.push({ title: item.title, status, order });
  }

  actionable.sort((a, b) => a.order - b.order);
  return {
    counts,
    topItems: actionable.slice(0, 5).map(({ title, status }) => ({ title, status })),
  };
}
