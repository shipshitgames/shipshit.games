import { useCallback, useEffect, useMemo } from "react";
import { BookOpen, Copy, RefreshCw } from "lucide-react";

import type {
  LoreNote,
  LoreNoteSummary,
  PlayLabContext,
  ProjectState,
} from "../../shared/ipc";
import { SelectField } from "../components/ui";
import { usePatchState } from "../lib/hooks";
import { EMPTY_PROJECT_STATE, errorMessage } from "../lib/studio";

function byteLabel(bytes: number): string {
  return bytes < 1_024 ? `${bytes} B` : `${Math.round(bytes / 1_024)} KB`;
}

export function PlayLabPane() {
  const [view, patch] = usePatchState({
    projects: EMPTY_PROJECT_STATE as ProjectState,
    context: null as PlayLabContext | null,
    note: null as LoreNote | null,
    query: "",
    busy: false,
    error: "",
    message: "",
  });

  const filteredLore = useMemo(() => {
    const needle = view.query.trim().toLowerCase();
    if (!needle) return view.context?.lore || [];
    return (view.context?.lore || []).filter((item) => (
      `${item.title} ${item.path} ${item.tags.join(" ")} ${item.excerpt}`
        .toLowerCase()
        .includes(needle)
    ));
  }, [view.context, view.query]);

  const load = useCallback(async (
    projectId?: string,
    refresh = false,
  ) => {
    const studio = window.studio;
    if (!studio) {
      patch({ error: "studio bridge unavailable" });
      return;
    }
    patch({ busy: true, error: "" });
    try {
      const state = await studio.projects.list();
      const selectedId = projectId || state.activeProjectId || state.projects[0]?.id;
      const next = await studio.playLab.context(selectedId, refresh);
      patch({ projects: state, context: next, note: null });
    } catch (caught) {
      patch({ error: errorMessage(caught) });
    } finally {
      patch({ busy: false });
    }
  }, [patch]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeProject(projectId: string) {
    const studio = window.studio;
    if (!studio) return;
    patch({ busy: true, error: "" });
    try {
      const state = await studio.projects.setActive(projectId);
      const next = await studio.playLab.context(projectId);
      patch({ projects: state, context: next, note: null });
    } catch (caught) {
      patch({ error: errorMessage(caught) });
    } finally {
      patch({ busy: false });
    }
  }

  async function readNote(item: LoreNoteSummary) {
    const studio = window.studio;
    if (!studio || !view.context) return;
    patch({ error: "" });
    try {
      const selected = await studio.lore.read(view.context.project.id, item.path);
      patch({
        note: selected,
        error: selected ? "" : `Unable to read ${item.path}`,
      });
    } catch (caught) {
      patch({ error: errorMessage(caught) });
    }
  }

  async function copyContext() {
    if (!view.context) return;
    try {
      await navigator.clipboard.writeText(view.context.promptContext);
      patch({ message: "Prompt context copied" });
    } catch (caught) {
      patch({ error: errorMessage(caught) });
    }
  }

  if (!view.projects.projects.length && !view.busy) {
    return (
      <div className="placeholder-card">
        <div className="placeholder-glyph" aria-hidden="true"><BookOpen size={28} /></div>
        <p><strong>No local projects registered.</strong></p>
        <p className="placeholder-sub">Add an IP repo in Projects to inspect its games, lore, and assets.</p>
        {view.error && <div className="error-text">{view.error}</div>}
      </div>
    );
  }

  return (
    <div className="play-lab">
      <div className="play-lab-toolbar">
        <SelectField
          label="IP project"
          value={view.context?.project.id || view.projects.activeProjectId}
          onChange={(value) => void changeProject(value)}
        >
          {view.projects.projects.map((project) => (
            <option key={project.id} value={project.id}>{project.name} · {project.slug}</option>
          ))}
        </SelectField>
        <button className="btn" type="button" disabled={view.busy} onClick={() => void load(view.context?.project.id, true)}>
          <RefreshCw size={13} /> Refresh index
        </button>
        <button className="btn" type="button" disabled={!view.context} onClick={() => void copyContext()}>
          <Copy size={13} /> Copy context
        </button>
      </div>

      {view.error && <div className="error-text">{view.error}</div>}
      {view.message && <div className="success-text">{view.message}</div>}

      {view.context && (
        <>
          <section className="play-lab-overview">
            <div>
              <span>Games</span>
              <strong>{view.context.games.length}</strong>
            </div>
            <div>
              <span>Lore notes</span>
              <strong>{view.context.project.loreFileCount}</strong>
            </div>
            <div>
              <span>Assets</span>
              <strong>{view.context.project.assetsExists ? "Detected" : "Missing"}</strong>
            </div>
            <div>
              <span>Context</span>
              <strong>{view.context.truncated ? "Truncated" : "Complete"}</strong>
            </div>
          </section>

          <div className="play-lab-paths">
            <span>{view.context.project.repoPath}</span>
            <span>{view.context.project.loreRoot}</span>
            <span>{view.context.project.assetsRoot}</span>
          </div>
          {view.context.project.error && <div className="error-text">{view.context.project.error}</div>}

          <section className="play-lab-games">
            <div className="play-lab-section-head">
              <strong>Playable slices</strong>
              <span>Launch and validation live in Gyms</span>
            </div>
            <div className="play-lab-game-grid">
              {view.context.games.map((game) => (
                <article className="play-lab-game" key={game.slug}>
                  <strong>{game.name}</strong>
                  <span>{game.packageName || game.slug}</span>
                  <code>{game.scripts.dev || "no dev script"}</code>
                  <div>
                    {game.maps.length
                      ? game.maps.map((map) => <small key={map.path}>{map.path}</small>)
                      : <small>No maps detected</small>}
                  </div>
                </article>
              ))}
              {!view.context.games.length && <div className="play-lab-empty">No games detected under apps/games.</div>}
            </div>
          </section>

          <section className="play-lab-lore">
            <div className="play-lab-note-list">
              <div className="play-lab-section-head">
                <strong>Lore vault</strong>
                <span>{filteredLore.length} notes</span>
              </div>
              <input
                className="play-lab-search"
                value={view.query}
                onChange={(event) => patch({ query: event.target.value })}
                placeholder="Search canon, paths, and tags"
                aria-label="Search lore"
              />
              <div className="play-lab-note-scroll">
                {filteredLore.map((item) => (
                  <button
                    className={"play-lab-note" + (view.note?.path === item.path ? " is-active" : "")}
                    type="button"
                    key={item.path}
                    onClick={() => void readNote(item)}
                  >
                    <strong>{item.title}</strong>
                    <span>{item.path}</span>
                    <small>{byteLabel(item.bytes)}{item.tags.length ? ` · #${item.tags.join(" #")}` : ""}</small>
                  </button>
                ))}
              </div>
            </div>

            <article className="play-lab-note-reader">
              {view.note ? (
                <>
                  <header>
                    <div>
                      <strong>{view.note.title}</strong>
                      <span>{view.note.path}</span>
                    </div>
                    <small>{view.note.backlinks.length} backlinks · {view.note.wikiLinks.length} links</small>
                  </header>
                  <pre>{view.note.content}</pre>
                </>
              ) : (
                <div className="play-lab-empty">Select a lore note to inspect canon and backlinks.</div>
              )}
            </article>
          </section>

          <details className="play-lab-context">
            <summary>Generated prompt context</summary>
            <pre>{view.context.promptContext}</pre>
          </details>
        </>
      )}
    </div>
  );
}
