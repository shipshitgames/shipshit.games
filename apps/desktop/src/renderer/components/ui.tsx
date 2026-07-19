import type { ReactNode } from "react";

import type { ProjectSummary } from "../../shared/ipc";
import type { ProjectSelection } from "../lib/hooks";

// Every field component renders a literal <label className="field"> around its
// control so the text is natively associated with it — visible to screen
// readers and to static a11y analysis alike.

function fieldClass(grow?: boolean, className?: string): string {
  return ["field", grow ? "field-grow" : "", className || ""].filter(Boolean).join(" ");
}

export function TextField({ label, value, onChange, placeholder, password, grow, className }: {
  label: ReactNode;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  password?: boolean;
  grow?: boolean;
  className?: string;
}) {
  return (
    <label className={fieldClass(grow, className)}>
      <span>{label}</span>
      <input type={password ? "password" : "text"} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function TextAreaField({ label, value, onChange, rows = 3, placeholder, grow, className }: {
  label: ReactNode;
  value: string;
  onChange: (next: string) => void;
  rows?: number;
  placeholder?: string;
  grow?: boolean;
  className?: string;
}) {
  return (
    <label className={fieldClass(grow, className)}>
      <span>{label}</span>
      <textarea value={value} rows={rows} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function SelectField({ label, value, onChange, children, grow, className }: {
  label: ReactNode;
  value: string;
  onChange: (next: string) => void;
  children: ReactNode;
  grow?: boolean;
  className?: string;
}) {
  return (
    <label className={fieldClass(grow, className)}>
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>{children}</select>
    </label>
  );
}

/**
 * Clamped number field. With `clamp` (default), values are clamped to
 * [min, max] on every change; unparseable input falls back to `fallback`
 * (then clamps) and `integer` floors first. With `clamp: false` only the
 * HTML min/max attributes apply (browser stepper/validation, no JS rewrite).
 */
export function NumField({ label, value, onChange, min, max, step, fallback, integer, clamp = true }: {
  label: ReactNode;
  value: number;
  onChange: (next: number) => void;
  min: number;
  max?: number;
  step?: number;
  fallback?: number;
  integer?: boolean;
  clamp?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          let next = Number(e.target.value) || fallback || 0;
          if (clamp) {
            if (integer) next = Math.floor(next);
            if (max !== undefined) next = Math.min(max, next);
            next = Math.max(min, next);
          }
          onChange(next);
        }}
      />
    </label>
  );
}

/** Streamed-log block; `err` switches to the danger treatment. */
export function LogView({ err, children }: { err?: boolean; children: ReactNode }) {
  return <pre className={"log" + (err ? " is-err" : "")}>{children}</pre>;
}

/** Square preview placeholder used while a generator is idle or busy. */
export function EmptyTile({ children }: { children: ReactNode }) {
  return <div className="empty-tile">{children}</div>;
}

/**
 * Game/project picker shared by the generator panes: selects among registered
 * projects (switching the active project) or falls back to plain game slugs.
 */
export function GameField({ selection }: { selection: ProjectSelection }) {
  const { game, setGame, games, projectState, selectedProject, changeProject } = selection;
  return (
    <label className="field">
      <span>Game</span>
      <select
        value={selectedProject ? selectedProject.id : game}
        onChange={(e) => {
          if (projectState.projects.length) void changeProject(e.target.value);
          else setGame(e.target.value);
        }}
      >
        {projectState.projects.length
          ? projectState.projects.map((project) => <option key={project.id} value={project.id}>{project.name} · {project.slug}</option>)
          : games.map((g) => <option key={g} value={g}>{g}</option>)}
      </select>
    </label>
  );
}

/** Manifest path + validation error for the currently selected project. */
export function ProjectManifestNote({ project }: { project: ProjectSummary | null }) {
  if (!project) return null;
  return (
    <>
      {project.manifestPath && <div className="path path-muted">manifest {project.manifestPath}</div>}
      {!project.valid && <div className="error-text">{project.error}</div>}
    </>
  );
}
