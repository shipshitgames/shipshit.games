import { useCallback, useEffect, useState } from "react";

import type {
  GymCheckReportSummary,
  GymCheckRun,
  GymCheckScreenshot,
  GymCheckStatus,
  GymLaunchResult,
  GymProject,
  GymSummary,
  GymsState,
} from "../../shared/ipc";
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

function checkBadge(
  status: GymCheckStatus,
): { className: string; label: string } {
  if (status === "passed") {
    return { className: "badge-success", label: "pass" };
  }
  if (status === "failed") {
    return { className: "badge-danger", label: "fail" };
  }
  return { className: "badge-muted", label: status };
}

function checkDurationLabel(run: GymCheckRun): string {
  if (!run.finishedAt) return "";
  const durationMs =
    new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime();
  return Number.isFinite(durationMs) && durationMs >= 0
    ? `${(durationMs / 1_000).toFixed(1)}s`
    : "";
}

function GymCheckRow({
  run,
  selected,
  onSelect,
}: {
  run: GymCheckRun;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const badge = checkBadge(run.status);
  return (
    <button
      type="button"
      className={`gym-check-row${selected ? " is-selected" : ""}`}
      onClick={() => onSelect(run.id)}
    >
      <span className={`badge ${badge.className}`}>{badge.label}</span>
      <strong>{run.gymLabel}</strong>
      <span className="gym-check-time">
        {new Date(run.startedAt).toLocaleTimeString()}
      </span>
      <span className="gym-check-duration">{checkDurationLabel(run)}</span>
    </button>
  );
}

const EAGER_SCREENSHOTS = 3;

function GymCheckShots({
  runId,
  screenshots,
}: {
  runId: string;
  screenshots: GymCheckScreenshot[];
}) {
  const [images, setImages] = useState<Record<string, string>>({});

  const fetchShot = useCallback(
    async (file: string) => {
      try {
        const image = await window.studio?.gymChecks.image(runId, file);
        if (image?.dataUrl) {
          setImages((current) =>
            current[file]
              ? current
              : { ...current, [file]: image.dataUrl },
          );
        }
      } catch {
        // The artifact may have been pruned between listing and fetch.
      }
    },
    [runId],
  );

  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      screenshots.slice(0, EAGER_SCREENSHOTS).map(async (shot) => {
        try {
          const image = await window.studio?.gymChecks.image(
            runId,
            shot.file,
          );
          if (image?.dataUrl && !cancelled) {
            setImages((current) =>
              current[shot.file]
                ? current
                : { ...current, [shot.file]: image.dataUrl },
            );
          }
        } catch {
          // A missing screenshot leaves the explicit load button visible.
        }
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [runId, screenshots]);

  return (
    <div className="gym-check-shots">
      {screenshots.map((shot) =>
        images[shot.file] ? (
          <figure className="gym-check-shot-cell" key={shot.file}>
            <img
              className="gym-check-shot"
              src={images[shot.file]}
              alt={`${shot.name} screenshot at ${shot.atMs}ms`}
            />
            <figcaption>
              {shot.name} · {shot.atMs}ms
            </figcaption>
          </figure>
        ) : (
          <button
            className="btn"
            type="button"
            key={shot.file}
            onClick={() => void fetchShot(shot.file)}
          >
            Load {shot.name}
          </button>
        ),
      )}
    </div>
  );
}

function GymCheckReport({
  runId,
  report,
}: {
  runId: string;
  report: GymCheckReportSummary;
}) {
  return (
    <div className="gym-check-report">
      {report.failures.length > 0 && (
        <ul className="gym-check-failures">
          {report.failures.map((failure, index) => (
            <li key={`${index}:${failure}`}>{failure}</li>
          ))}
        </ul>
      )}
      <div className="gym-check-line">
        page errors {report.pageErrors.length} · console errors{" "}
        {report.consoleErrors.length}
      </div>
      <div className="gym-check-line">
        ready {report.ready.ok ? "ok" : "failed"} · {report.ready.mode} · waited{" "}
        {report.ready.waitedMs}ms
        {report.ready.error ? ` · ${report.ready.error}` : ""}
      </div>
      {report.canvas.found && (
        <div className="gym-check-line">
          canvas {report.canvas.width}×{report.canvas.height}
          {report.canvas.blank === null
            ? ""
            : report.canvas.blank
              ? " · blank"
              : " · painted"}
          {report.canvas.fillRatio === null
            ? ""
            : ` · fill ${(report.canvas.fillRatio * 100).toFixed(1)}%`}
        </div>
      )}
      {report.screenshots.length > 0 && (
        <GymCheckShots
          key={runId}
          runId={runId}
          screenshots={report.screenshots}
        />
      )}
    </div>
  );
}

function GymCheckDetail({
  run,
  liveLog,
  stopping,
  onStop,
}: {
  run: GymCheckRun;
  liveLog: string;
  stopping: boolean;
  onStop: (id: string) => void;
}) {
  const badge = checkBadge(run.status);
  const active = run.status === "booting" || run.status === "testing";
  const log = liveLog || [run.bootLog, run.testerLog].filter(Boolean).join("");
  return (
    <div className="gym-check-detail">
      <div className="gym-check-detail-head">
        <span className={`badge ${badge.className}`}>{badge.label}</span>
        <strong>{run.gymLabel}</strong>
        <span className="path">{run.url}</span>
        {active && (
          <button
            className="btn btn-danger"
            type="button"
            disabled={stopping}
            onClick={() => onStop(run.id)}
          >
            {stopping ? "Stopping…" : "Stop"}
          </button>
        )}
      </div>
      {run.error && <LogView err>{run.error}</LogView>}
      <LogView>{log || "—"}</LogView>
      {run.report && (
        <GymCheckReport runId={run.id} report={run.report} />
      )}
      <div className="path path-muted">{run.reportDir}</div>
    </div>
  );
}

interface GymSidebarProps {
  state: GymsState;
  projectId: string;
  busy: boolean;
  onReload: () => void;
  onSelect: (projectId: string) => void;
}

function GymSidebar({
  state,
  projectId,
  busy,
  onReload,
  onSelect,
}: GymSidebarProps) {
  return (
    <aside className="gym-sidebar">
      <div className="gym-sidebar-head">
        <span>Projects</span>
        <button className="btn" type="button" disabled={busy} onClick={onReload}>
          {busy ? "Loading…" : "Reload"}
        </button>
      </div>
      {state.projects.length ? (
        <div className="gym-project-list">
          {state.projects.map((project) => (
            <button
              type="button"
              key={project.id}
              className={`gym-project${project.id === projectId ? " is-active" : ""}`}
              onClick={() => onSelect(project.id)}
            >
              <strong>{project.name}</strong>
              <span>{project.slug}</span>
              <b>{project.gyms.length}</b>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty">no local projects</div>
      )}
    </aside>
  );
}

interface GymChecksPanelProps {
  runs: GymCheckRun[];
  error: string;
  selectedRun: GymCheckRun | null;
  checkLogs: Record<string, string>;
  stopping: boolean;
  onSelect: (runId: string) => void;
  onStop: (runId: string) => void;
}

function GymChecksPanel({
  runs,
  error,
  selectedRun,
  checkLogs,
  stopping,
  onSelect,
  onStop,
}: GymChecksPanelProps) {
  return (
    <section className="gym-checks" aria-label="Gym checks">
      <div className="gym-checks-head">
        <span>Checks</span>
        {runs.length > 0 && <b>{runs.length}</b>}
      </div>
      {error && <LogView err>{error}</LogView>}
      {runs.length > 0 ? (
        <div className="gym-check-list">
          {runs.map((run) => (
            <GymCheckRow
              key={run.id}
              run={run}
              selected={run.id === selectedRun?.id}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : (
        <div className="empty">no checks yet</div>
      )}
      {selectedRun && (
        <GymCheckDetail
          run={selectedRun}
          liveLog={checkLogs[selectedRun.id] || ""}
          stopping={stopping}
          onStop={onStop}
        />
      )}
    </section>
  );
}

interface GymCardGridProps {
  project: GymProject;
  launching: string;
  starting: string;
  activeCheck: GymCheckRun | null;
  checkBusy: boolean;
  onLaunch: (gym: GymSummary) => void;
  onCheck: (gym: GymSummary) => void;
}

function GymCardGrid({
  project,
  launching,
  starting,
  activeCheck,
  checkBusy,
  onLaunch,
  onCheck,
}: GymCardGridProps) {
  if (!project.gyms.length) {
    return (
      <div className="empty-block">
        <span>no gyms declared</span>
        <b>{project.slug}</b>
      </div>
    );
  }
  return (
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
          <div className="gym-card-actions">
            <button
              className="btn btn-primary gym-launch"
              type="button"
              disabled={Boolean(launching)}
              onClick={() => onLaunch(gym)}
            >
              {launching === gym.id ? "Launching…" : "Launch"}
            </button>
            <button
              className="btn"
              type="button"
              disabled={!gym.url || checkBusy}
              title={gym.url ? undefined : "Requires a gym URL"}
              onClick={() => onCheck(gym)}
            >
              {starting === gym.id || activeCheck?.gymId === gym.id
                ? "Checking…"
                : "Check"}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

export function GymsPane() {
  const [view, patch] = usePatchState({
    state: EMPTY_GYMS_STATE,
    projectId: "",
    busy: false,
    launching: "",
    message: null as GymLaunchResult | null,
    error: "",
    runs: [] as GymCheckRun[],
    selectedRunId: "",
    checkLogs: {} as Record<string, string>,
    starting: "",
    stopping: false,
    checkError: "",
  });
  const project = activeGymProject(view.state, view.projectId);
  const projectId = project?.id || "";

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

  const loadRuns = useCallback(async () => {
    if (!window.studio?.gymChecks || !projectId) {
      patch({ runs: [] });
      return;
    }
    try {
      const result = await window.studio.gymChecks.list(projectId);
      patch({ runs: result.runs, checkError: "" });
    } catch (error) {
      patch({ checkError: errorMessage(error) });
    }
  }, [patch, projectId]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  useEffect(() => {
    return window.studio?.onGymCheckEvent((event) => {
      patch((current) => ({
        checkLogs: event.chunk
          ? {
              ...current.checkLogs,
              [event.runId]: (
                (current.checkLogs[event.runId] || "") + event.chunk
              ).slice(-8_000),
            }
          : current.checkLogs,
        runs: current.runs.map((run) =>
          run.id === event.runId
            ? { ...run, status: event.status }
            : run,
        ),
      }));
      if (event.done) {
        void window.studio?.gymChecks
          .get(event.runId)
          .then(({ run }) => {
            if (!run) return;
            patch((current) => ({
              runs: current.runs.map((candidate) =>
                candidate.id === run.id ? run : candidate,
              ),
            }));
          })
          .catch(() => undefined);
        void loadRuns();
      }
    });
  }, [loadRuns, patch]);

  const activeCheck =
    view.runs.find(
      (run) => run.status === "booting" || run.status === "testing",
    ) || null;
  const selectedRun =
    view.runs.find((run) => run.id === view.selectedRunId)
    || activeCheck
    || view.runs[0]
    || null;
  const checkBusy = Boolean(view.starting || activeCheck);

  async function startCheck(gym: GymSummary) {
    if (!window.studio?.gymChecks || !project) {
      patch({ checkError: "studio bridge unavailable" });
      return;
    }
    patch({ starting: gym.id, checkError: "" });
    try {
      const result = await window.studio.gymChecks.start(
        project.id,
        gym.id,
      );
      if (!result.ok) {
        patch({ checkError: result.error || "check failed to start" });
        return;
      }
      patch((current) => ({
        runs: result.run
          ? [
              result.run,
              ...current.runs.filter((run) => run.id !== result.run?.id),
            ]
          : current.runs,
        selectedRunId: result.runId || current.selectedRunId,
      }));
      if (!result.run) void loadRuns();
    } catch (error) {
      patch({ checkError: errorMessage(error) });
    } finally {
      patch({ starting: "" });
    }
  }

  async function stopCheck(runId: string) {
    if (!window.studio?.gymChecks) {
      patch({ checkError: "studio bridge unavailable" });
      return;
    }
    patch({ stopping: true, checkError: "" });
    try {
      const result = await window.studio.gymChecks.stop(runId);
      if (!result.ok) {
        patch({ checkError: result.error || "stop failed" });
      }
    } catch (error) {
      patch({ checkError: errorMessage(error) });
    } finally {
      patch({ stopping: false });
    }
  }

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
      <GymSidebar
        state={view.state}
        projectId={project?.id || ""}
        busy={view.busy}
        onReload={() => void load()}
        onSelect={(selectedProjectId) =>
          patch({
            projectId: selectedProjectId,
            message: null,
            error: "",
            selectedRunId: "",
            checkError: "",
          })
        }
      />

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

            <GymChecksPanel
              runs={view.runs}
              error={view.checkError}
              selectedRun={selectedRun}
              checkLogs={view.checkLogs}
              stopping={view.stopping}
              onSelect={(selectedRunId) => patch({ selectedRunId })}
              onStop={(runId) => void stopCheck(runId)}
            />

            <GymCardGrid
              project={project}
              launching={view.launching}
              starting={view.starting}
              activeCheck={activeCheck}
              checkBusy={checkBusy}
              onLaunch={(gym) => void launch(gym)}
              onCheck={(gym) => void startCheck(gym)}
            />
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
