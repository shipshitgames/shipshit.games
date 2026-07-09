import { describe, expect, test } from "bun:test";

import type { RoadmapCounts } from "./content/types";
import {
  normalizeRoadmapStatus,
  roadmapCount,
  roadmapStatusLabel,
  summarizeRoadmapItems,
} from "./roadmap-status";

describe("roadmap status normalization", () => {
  test("maps the legacy Todo option to canonical Backlog", () => {
    expect(normalizeRoadmapStatus("Todo")).toBe("Backlog");
    expect(normalizeRoadmapStatus("Backlog")).toBe("Backlog");
    expect(roadmapStatusLabel("Todo")).toBe("Backlog");
  });

  test("recognizes every live GitHub project option", () => {
    expect(normalizeRoadmapStatus("In Progress")).toBe("In Progress");
    expect(normalizeRoadmapStatus("Human Review")).toBe("Human Review");
    expect(normalizeRoadmapStatus("Done")).toBe("Done");
    expect(normalizeRoadmapStatus("Deferred")).toBe("Deferred");
    expect(normalizeRoadmapStatus("unexpected")).toBe("Other");
  });
});

describe("roadmap summaries", () => {
  test("counts statuses separately and prioritizes actionable work", () => {
    const summary = summarizeRoadmapItems([
      { title: "Later", status: "Deferred" },
      { title: "Queued", status: "Backlog" },
      { title: "Building", status: "In Progress" },
      { title: "Needs a person", status: "Human Review" },
      { title: "Legacy queue", status: "Todo" },
      { title: "Shipped", status: "Done" },
      { title: "Unknown", status: "Custom" },
    ]);

    expect(summary.counts).toEqual({
      todo: 2,
      inProgress: 1,
      humanReview: 1,
      done: 1,
      deferred: 1,
    });
    expect(summary.topItems).toEqual([
      { title: "Needs a person", status: "Human Review" },
      { title: "Building", status: "In Progress" },
      { title: "Queued", status: "Backlog" },
      { title: "Legacy queue", status: "Backlog" },
    ]);
  });

  test("reads legacy snapshot counts without requiring new fields", () => {
    const legacyCounts: RoadmapCounts = { todo: 3, inProgress: 2, done: 1 };

    expect(roadmapCount(legacyCounts, "todo")).toBe(3);
    expect(roadmapCount(legacyCounts, "humanReview")).toBe(0);
    expect(roadmapCount(legacyCounts, "deferred")).toBe(0);
  });
});
