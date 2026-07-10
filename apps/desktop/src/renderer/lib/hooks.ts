import { useEffect, useReducer, useRef, useState, type Dispatch, type SetStateAction } from "react";

import type { ProjectState, ProjectSummary, Settings } from "../../shared/ipc";
import { EMPTY_PROJECT_STATE, activeProject, withSettingsDefaults } from "./studio";

export type Patch<T> = Partial<T> | ((current: T) => Partial<T>);

/**
 * Merge a patch into the current state, bailing out to the SAME reference when
 * nothing changes (every patched key already `Object.is`-equal) — the useState
 * no-op-update contract. Exported for direct testing of that bail-out.
 */
export function applyPatch<T extends object>(current: T, patch: Patch<T>): T {
  const partial = typeof patch === "function" ? patch(current) : patch;
  const changed = (Object.keys(partial) as (keyof T)[]).some((key) => !Object.is(current[key], partial[key]));
  return changed ? { ...current, ...partial } : current;
}

/**
 * One reducer for a pane's related state: `patch({ busy: true })` merges into
 * the state object in a single dispatch (one render per logical update instead
 * of one per useState), and a function patch reads the current state first.
 * The returned `patch` is referentially stable.
 *
 * Like `useState`, a patch that changes nothing bails out (see {@link applyPatch}),
 * so a no-op update — e.g. a NumField clamp that re-sets the current value — does
 * not re-render or invalidate downstream `useMemo`/effect identities.
 */
export function usePatchState<T extends object>(initial: T): [T, (patch: Patch<T>) => void] {
  return useReducer(applyPatch<T>, initial);
}

type LogSubscribe = ((cb: (chunk: string) => void) => () => void) | undefined;

/** Subscribe to one or more streamed-log bridge events, capped at 8k chars. */
export function useStreamLog(...subscribers: LogSubscribe[]): [string, Dispatch<SetStateAction<string>>] {
  const [log, setLog] = useState("");
  // Bridge subscription functions are stable for the window's lifetime, so the
  // effect intentionally runs once; the ref keeps the list out of the deps.
  const subscribersRef = useRef(subscribers);
  subscribersRef.current = subscribers;
  useEffect(() => {
    const offs = subscribersRef.current.map((subscribe) => subscribe?.((chunk) => setLog((l) => (l + chunk).slice(-8000))));
    return () => {
      for (const off of offs) off?.();
    };
  }, []);
  return [log, setLog];
}

export type ProjectSelection = {
  game: string;
  setGame: (game: string) => void;
  games: string[];
  projectState: ProjectState;
  selectedProject: ProjectSummary | null;
  changeProject: (id: string) => Promise<void>;
};

/**
 * The generator panes' shared project/game selection: loads settings (for the
 * default game) and the project registry, tracks the selected project, and
 * falls back to the plain slug list when no local projects are registered.
 * `onSettings` lets a pane seed its own defaults (provider, model) from the
 * same settings fetch.
 */
export function useProjectSelection(onSettings?: (settings: Settings) => void): ProjectSelection {
  const [game, setGame] = useState("scourge-survivors");
  const [games, setGames] = useState<string[]>(["scourge-survivors"]);
  const [projectState, setProjectState] = useState<ProjectState>(EMPTY_PROJECT_STATE);
  const [projectId, setProjectId] = useState("");
  const onSettingsRef = useRef(onSettings);
  onSettingsRef.current = onSettings;

  useEffect(() => {
    window.studio?.settings.get().then((s) => {
      const next = withSettingsDefaults(s);
      setGame(next.defaultGame);
      onSettingsRef.current?.(next);
    }).catch(() => {});
    window.studio?.projects.list().then((state) => {
      setProjectState(state);
      const current = activeProject(state);
      if (current) {
        setProjectId(current.id);
        setGame(current.slug);
        setGames(state.projects.map((project) => project.slug));
      }
    }).catch(() => {
      window.studio?.listGames().then((g) => g?.length && setGames(g)).catch(() => {});
    });
  }, []);

  const selectedProject = projectState.projects.find((project) => project.id === projectId) || activeProject(projectState);

  async function changeProject(id: string) {
    setProjectId(id);
    const next = await window.studio?.projects.setActive(id);
    if (!next) return;
    setProjectState(next);
    const current = activeProject(next);
    if (current) setGame(current.slug);
  }

  return { game, setGame, games, projectState, selectedProject, changeProject };
}
