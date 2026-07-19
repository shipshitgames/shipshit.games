import { useEffect, useState } from "react";
import { Folder } from "lucide-react";

import type { ProjectState } from "../../shared/ipc";
import { EMPTY_PROJECT_STATE, activeProject, errorMessage, kindSummary } from "../lib/studio";

export function ProjectsPane() {
  const [projectState, setProjectState] = useState<ProjectState>(EMPTY_PROJECT_STATE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const current = activeProject(projectState);

  useEffect(() => {
    window.studio?.projects.list().then(setProjectState).catch((e) => setError(errorMessage(e)));
  }, []);

  // Add/activate/remove all share the same busy + error + state-refresh shape.
  async function mutate(run: () => Promise<ProjectState>) {
    if (!window.studio?.projects) { setError("studio bridge unavailable"); return; }
    setBusy(true);
    setError("");
    try {
      setProjectState(await run());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="projects">
      <div className="projects-toolbar">
        <button className="btn btn-primary" type="button" disabled={busy} onClick={() => mutate(() => window.studio!.projects.add())}>Add game repo...</button>
        <div className="project-active-path">{current?.manifestPath || "no manifest target"}</div>
      </div>
      {error && <div className="error-text">{error}</div>}
      {projectState.projects.length ? (
        <div className="project-list">
          {projectState.projects.map((project) => (
            <article className={"project-card" + (project.isActive ? " is-active" : "")} key={project.id}>
              <div className="project-main">
                <div className="project-title">
                  <strong>{project.name}</strong>
                  <span>{project.slug}</span>
                  <span className={"badge " + (project.valid ? "badge-success" : "badge-danger")}>{project.valid ? "valid" : "invalid"}</span>
                </div>
                <div className="path path-muted">{project.repoPath}</div>
                <div className="path">{project.manifestPath}</div>
                <div className="project-kinds">{kindSummary(project.kindCounts)}</div>
                {project.error && <div className="error-text">{project.error}</div>}
                <div className="project-catalog">
                  {project.assets.length ? project.assets.slice(0, 12).map((asset) => (
                    <span className="project-asset" key={`${asset.kind}:${asset.id}`}>{asset.kind}:{asset.id}</span>
                  )) : <span className="project-empty">catalog empty</span>}
                  {project.catalogTruncated && <span className="project-empty">+ more</span>}
                </div>
              </div>
              <div className="project-actions">
                <button className="btn" type="button" disabled={busy || project.isActive} onClick={() => mutate(() => window.studio!.projects.setActive(project.id))}>
                  {project.isActive ? "Active" : "Use"}
                </button>
                {project.source === "registered" && (
                  <button className="btn btn-danger" type="button" disabled={busy} onClick={() => mutate(() => window.studio!.projects.remove(project.id))}>Remove</button>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="placeholder-card">
          <div className="placeholder-glyph" aria-hidden="true"><Folder size={28} /></div>
          <p><strong>No local projects registered.</strong></p>
        </div>
      )}
    </div>
  );
}
