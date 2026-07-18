import { expect, test } from "bun:test";

import type { ProjectState, ProjectSummary } from "../shared/ipc";
import { selectProject } from "./pane-machinery";

function project(id: string): ProjectSummary {
  return {
    id,
    name: id.toUpperCase(),
    slug: id,
    repoPath: `/projects/${id}`,
    source: "registered",
    manifestPath: `/projects/${id}/assets.json`,
    isActive: id === "bravo",
    exists: true,
    valid: true,
    error: null,
    assetCount: 0,
    kindCounts: {},
    assets: [],
    catalogTruncated: false,
  };
}

const state: ProjectState = {
  projects: [project("alpha"), project("bravo")],
  activeProjectId: "bravo",
  activeManifestPath: "/projects/bravo/assets.json",
};

test("selectProject prefers an explicit pane selection", () => {
  expect(selectProject(state, "alpha")?.id).toBe("alpha");
});

test("selectProject falls back to the global active project", () => {
  expect(selectProject(state, "")?.id).toBe("bravo");
});

test("selectProject falls back to the first project and handles an empty registry", () => {
  expect(selectProject({ ...state, activeProjectId: "missing" }, "")?.id).toBe("alpha");
  expect(selectProject({ ...state, projects: [] }, "")).toBeNull();
});
