import { useEffect, useState } from "react";

import type { ProjectState, ProjectSummary, Settings } from "../shared/ipc";

const DEFAULT_GAME = "scourge-survivors";
const EMPTY_PROJECT_STATE: ProjectState = {
  projects: [],
  activeProjectId: "",
  activeManifestPath: null,
};

type LogSubscriber = (callback: (chunk: string) => void) => () => void;

export interface ProjectTarget {
  settings: Settings | null;
  projectState: ProjectState;
  selectedProject: ProjectSummary | null;
  game: string;
  games: string[];
  setGame: (game: string) => void;
  changeProject: (id: string) => Promise<void>;
}

export function selectProject(projectState: ProjectState, projectId: string): ProjectSummary | null {
  return projectState.projects.find((project) => project.id === projectId)
    || projectState.projects.find((project) => project.id === projectState.activeProjectId)
    || projectState.projects[0]
    || null;
}

export function useProjectTarget(): ProjectTarget {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [game, setGame] = useState(DEFAULT_GAME);
  const [games, setGames] = useState<string[]>([DEFAULT_GAME]);
  const [projectState, setProjectState] = useState<ProjectState>(EMPTY_PROJECT_STATE);
  const [projectId, setProjectId] = useState("");
  const selectedProject = selectProject(projectState, projectId);

  useEffect(() => {
    window.studio.settings.get().then((next) => {
      setSettings(next);
      if (next.defaultGame) setGame(next.defaultGame);
    }).catch(() => {});
    window.studio.projects.list().then((state) => {
      setProjectState(state);
      const current = selectProject(state, state.activeProjectId);
      if (current) {
        setProjectId(current.id);
        setGame(current.slug);
        setGames(state.projects.map((project) => project.slug));
      }
    }).catch(() => {
      window.studio.listGames().then((list) => list?.length && setGames(list)).catch(() => {});
    });
  }, []);

  async function changeProject(id: string) {
    setProjectId(id);
    const next = await window.studio.projects.setActive(id);
    setProjectState(next);
    const current = selectProject(next, id);
    if (current) setGame(current.slug);
  }

  return {
    settings,
    projectState,
    selectedProject,
    game,
    games,
    setGame,
    changeProject,
  };
}

interface GameSelectProps {
  target: ProjectTarget;
}

export function GameSelect({ target }: GameSelectProps) {
  const { changeProject, game, games, projectState, selectedProject, setGame } = target;

  return (
    <>
      <label className="gen-field"><span>Game</span>
        <select value={selectedProject ? selectedProject.id : game} onChange={(event) => {
          if (projectState.projects.length) void changeProject(event.target.value);
          else setGame(event.target.value);
        }}>
          {projectState.projects.length
            ? projectState.projects.map((project) => <option key={project.id} value={project.id}>{project.name} · {project.slug}</option>)
            : games.map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>)}
        </select>
      </label>
      {selectedProject?.manifestPath && <div className="gen-manifest">manifest {selectedProject.manifestPath}</div>}
      {selectedProject && !selectedProject.valid && <div className="project-error">{selectedProject.error}</div>}
    </>
  );
}

export function useStreamingTask<Result>(subscribe: LogSubscriber) {
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => subscribe((chunk) => setLog((current) => (current + chunk).slice(-8000))), [subscribe]);

  async function run(task: () => Promise<Result>): Promise<Result | null> {
    setBusy(true);
    setResult(null);
    setLog("");
    try {
      const next = await task();
      setResult(next);
      return next;
    } catch (error) {
      setLog(String((error as Error)?.message ?? error));
      return null;
    } finally {
      setBusy(false);
    }
  }

  return { busy, log, result, run, setLog };
}
