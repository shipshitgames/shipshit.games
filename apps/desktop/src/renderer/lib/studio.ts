import type { ProjectState, ProjectSummary, Settings } from "../../shared/ipc";

export const EMPTY_PROJECT_STATE: ProjectState = { projects: [], activeProjectId: "", activeManifestPath: null };

export function withSettingsDefaults(settings: Partial<Settings>): Settings {
  return {
    defaultProvider: settings.defaultProvider || "codex",
    defaultGame: settings.defaultGame || "scourge-survivors",
    // providerDefaults passes through: settings:get/set already normalize it
    // against assetgen's catalog (DEFAULT_PROVIDER_BY_KIND) in the main process,
    // so the renderer no longer keeps its own drifted routing copy (#194).
    providerDefaults: { ...(settings.providerDefaults || {}) },
    falModelDefaults: settings.falModelDefaults || {},
    activeProjectId: settings.activeProjectId || "",
    projects: settings.projects || [],
  };
}

export function activeProject(projectState: ProjectState): ProjectSummary | null {
  return projectState.projects.find((project) => project.id === projectState.activeProjectId) || projectState.projects[0] || null;
}

export function kindSummary(kindCounts: Record<string, number>): string {
  const entries = Object.entries(kindCounts).sort(([a], [b]) => a.localeCompare(b));
  return entries.length ? entries.map(([kind, count]) => `${kind} ${count}`).join(" · ") : "no assets";
}

export function errorMessage(e: unknown): string {
  return String((e as Error)?.message ?? e);
}

export function formatBytes(bytes: number | null): string {
  if (!bytes && bytes !== 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
