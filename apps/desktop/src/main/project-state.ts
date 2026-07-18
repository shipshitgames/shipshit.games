// Project/settings orchestration kept free of Electron imports so its fallback,
// persistence, and merge contracts can be characterized with injected file I/O.
import {
  manifestPathForRepo,
  projectFromRepoPath,
  summarizeProject,
  uniqueProjects,
} from "./projects";
import { DEFAULT_GAME, DEFAULTS, normalizeSettings } from "./settings";

function createProjectState(options: any = {}) {
  const readSettingsFile = options.readSettingsFile;
  const writeSettingsFile = options.writeSettingsFile;
  const gameDir = options.gameDir;
  const pathExists = options.pathExists;
  const gameSlugs = Array.isArray(options.gameSlugs) ? options.gameSlugs : [];

  if (typeof readSettingsFile !== "function") throw new Error("readSettingsFile is required");
  if (typeof writeSettingsFile !== "function") throw new Error("writeSettingsFile is required");
  if (typeof gameDir !== "function") throw new Error("gameDir is required");
  if (typeof pathExists !== "function") throw new Error("pathExists is required");

  function readSettings() {
    try {
      return normalizeSettings({ ...DEFAULTS, ...(readSettingsFile() || {}) });
    } catch {
      return normalizeSettings(DEFAULTS);
    }
  }

  function writeSettings(settings) {
    const normalized = normalizeSettings(settings);
    writeSettingsFile(normalized);
    return normalized;
  }

  function mergeSettings(partial) {
    const current = readSettings();
    return writeSettings({
      ...current,
      ...(partial || {}),
      providerDefaults: {
        ...current.providerDefaults,
        ...(partial?.providerDefaults || {}),
      },
      // Replaced wholesale, not deep-merged: the renderer sends the full map,
      // and merging would make removing a kind's model override impossible.
      falModelDefaults: partial?.falModelDefaults || current.falModelDefaults,
    });
  }

  function discoveredProjects() {
    return gameSlugs
      .map((slug) => ({ slug, repoPath: gameDir(slug) }))
      .filter((project) => pathExists(project.repoPath))
      .map((project) =>
        projectFromRepoPath(project.repoPath, {
          slug: project.slug,
          name: project.slug,
          source: "discovered",
        }),
      );
  }

  function allProjects(settings = readSettings()) {
    return uniqueProjects([...(settings.projects || []), ...discoveredProjects()]);
  }

  function listProjectState(settings = readSettings()) {
    const projects = allProjects(settings);
    const activeProjectId =
      settings.activeProjectId && projects.some((project) => project.id === settings.activeProjectId)
        ? settings.activeProjectId
        : projects[0]?.id || "";
    const summaries = projects
      .map((project) => summarizeProject(project, activeProjectId))
      .filter(Boolean);
    const active =
      summaries.find((project) => project.id === activeProjectId) ||
      summaries[0] ||
      null;
    return {
      projects: summaries,
      activeProjectId: active?.id || "",
      activeManifestPath: active?.manifestPath || null,
    };
  }

  function listGames() {
    return listProjectState().projects.map((project) => project.slug);
  }

  function persistProjects(projects, activeProjectId) {
    const current = readSettings();
    const registered = uniqueProjects(projects).filter(
      (project) => project.source !== "discovered",
    );
    const active = allProjects({
      ...current,
      projects: registered,
      activeProjectId,
    }).find((project) => project.id === activeProjectId);
    return mergeSettings({
      projects: registered,
      activeProjectId: activeProjectId || "",
      defaultGame: active?.slug || current.defaultGame,
    });
  }

  function resolveProjectTarget(opts: any = {}) {
    const settings = readSettings();
    const projects = allProjects(settings);
    const requestedProjectId =
      typeof opts.projectId === "string" ? opts.projectId : "";
    const requestedGame = typeof opts.game === "string" ? opts.game : "";
    let project = projects.find(
      (candidate) => candidate.id === requestedProjectId,
    );
    if (!project && requestedGame) {
      project = projects.find((candidate) => candidate.slug === requestedGame);
    }
    if (!project && settings.activeProjectId) {
      project = projects.find(
        (candidate) => candidate.id === settings.activeProjectId,
      );
    }
    if (!project && requestedGame) {
      project = projectFromRepoPath(gameDir(requestedGame), {
        slug: requestedGame,
        name: requestedGame,
        source: "discovered",
      });
    }
    if (!project) {
      const slug = settings.defaultGame || DEFAULT_GAME;
      project = projectFromRepoPath(gameDir(slug), {
        slug,
        name: slug,
        source: "discovered",
      });
    }
    return {
      ...project,
      manifestPath: manifestPathForRepo(project.repoPath),
    };
  }

  function resolveGame(payload: any = {}) {
    const requested =
      typeof payload === "string" ? payload : payload?.game;
    return requested || readSettings().defaultGame;
  }

  return {
    allProjects,
    discoveredProjects,
    listGames,
    listProjectState,
    mergeSettings,
    persistProjects,
    readSettings,
    resolveGame,
    resolveProjectTarget,
    writeSettings,
  };
}

export { createProjectState };
