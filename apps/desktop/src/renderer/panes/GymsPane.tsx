import { useCallback, useEffect } from "react";

import type { GymLaunchResult, GymProject, GymSummary, GymsState } from "../../shared/ipc";
import { LogView } from "../components/ui";
import { usePatchState } from "../lib/hooks";
import { errorMessage } from "../lib/studio";

const EMPTY_GYMS_STATE: GymsState = { projects: [], activeProjectId: "" };

function activeGymProject(state: GymsState, projectId: string): GymProject | null {
  return state.projects.find((project) => project.id === projectId)
    || state.projects.find((project) => project.id === state.activeProjectId)
    || state.projects[0]
    || null;
}

function launchCommandLabel(gym: GymSummary): string {
  if (gym.script) return `bun run ${gym.script}${gym.args.length ? ` ${gym.args.join(" ")}` : ""}`;
  if (gym.command) return `${gym.command}${gym.args.length ? ` ${gym.args.join(" ")}` : ""}`;
  return gym.url || "open";
}

export function GymsPane() {
  const [view, patch] = usePatchState({
    state: EMPTY_GYMS_STATE,
    projectId: "",
    busy: false,
    launching: "",
    message: null as GymLaunchResult | null,
    error: "",
  });
  const project = activeGymProject(view.state, view.projectId);

  const load = useCallback(async () => {
    if (!window.studio?.gyms) {
      patch({ error: "studio bridge unavailable" });
      return;
    }
    patch({ busy: true, error: "" });
    try {
      const next = await window.studio.gyms.list();
      patch((current) => ({
        state: next,
        projectId: next.projects.some((project) => project.id === current.projectId) ? current.projectId : next.activeProjectId,
      }));
    } catch (e) {
      patch({ error: errorMessage(e) });
    } finally {
      patch({ busy: false });
    }
  }, [patch]);

  useEffect(() => {
    void load();
  }, [load]);

  async function launch(gym: GymSummary) {
    if (!window.studio?.gyms || !project) {
      patch({ error: "studio bridge unavailable" });
      return;
    }
    patch({ launching: gym.id, message: null, error: "" });
    try {
      const result = await window.studio.gyms.launch(project.id, gym.id);
      patch({ message: result, error: result.ok ? "" : result.error || "launch failed" });
    } catch (e) {
      patch({ error: errorMessage(e) });
    } finally {
      patch({ launching: "" });
    }
  }

  return (
    <div className="gyms">
      <aside className="gym-sidebar">
        <div className="gym-sidebar-head">
          <span>Projects</span>
          <button className="btn" type="button" disabled={view.busy} onClick={() => void load()}>{view.busy ? "Loading…" : "Reload"}</button>
        </div>
        {view.state.projects.length ? (
          <div className="gym-project-list">
            {view.state.projects.map((candidate) => (
              <button
                type="button"
                key={candidate.id}
                className={"gym-project" + (candidate.id === project?.id ? " is-active" : "")}
                onClick={() => patch({ projectId: candidate.id, message: null, error: "" })}
              >
                <strong>{candidate.name}</strong>
                <span>{candidate.slug}</span>
                <b>{candidate.gyms.length}</b>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty">no local projects</div>
        )}
      </aside>

      <section className="gym-main" aria-label="Gyms">
        {project ? (
          <>
            <div className="gym-project-head">
              <div>
                <h2>{project.name}</h2>
                <div className="path path-muted">{project.repoPath}</div>
              </div>
              <span className={"badge " + (project.declarationExists && !project.error ? "badge-success" : "badge-muted")}>
                {project.declarationExists ? "declared" : "none"}
              </span>
            </div>
            <div className="path path-muted">declaration {project.declarationPath}</div>
            {project.error && <LogView err>{project.error}</LogView>}
            {view.error && <LogView err>{view.error}</LogView>}
            {view.message?.ok && (
              <div className="gym-result">
                <strong>{view.message.label || "Gym"} launched</strong>
                <span>{view.message.command ? `${view.message.command} ${(view.message.args || []).join(" ")}` : view.message.url}</span>
                {view.message.pid ? <span>pid {view.message.pid}</span> : null}
              </div>
            )}

            {project.gyms.length ? (
              <div className="gym-grid">
                {project.gyms.map((gym) => (
                  <article className="gym-card" key={gym.id}>
                    <div className="gym-card-head">
                      <span className="gym-kind">{gym.kind}</span>
                      <strong>{gym.label}</strong>
                    </div>
                    {gym.description && <p>{gym.description}</p>}
                    <code className="gym-command">{launchCommandLabel(gym)}</code>
                    {gym.url && <div className="path">{gym.url}</div>}
                    <button className="btn btn-primary gym-launch" type="button" disabled={!!view.launching} onClick={() => void launch(gym)}>
                      {view.launching === gym.id ? "Launching…" : "Launch"}
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-block">
                <span>no gyms declared</span>
                <b>{project.slug}</b>
              </div>
            )}
          </>
        ) : (
          <div className="empty-block">
            <span>no projects available</span>
          </div>
        )}
      </section>
    </div>
  );
}
