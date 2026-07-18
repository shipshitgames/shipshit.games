import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import "@xterm/xterm/css/xterm.css";

import type {
  ArtLab,
  ArtLabVariant,
  FalModelInfo,
  GalleryAsset,
  GalleryResult,
  GenResult,
  GymLaunchResult,
  GymProject,
  GymSummary,
  GymsState,
  MapPreviewResult,
  MapsGenOptions,
  MapWriteResult,
  Moodboard,
  MoodboardItem,
  PixelizeResult,
  ProjectState,
  ProjectSummary,
  ResourceDerivativeItem,
  ResourceSourceItem,
  ResourceTranscriptItem,
  ResearchResult,
  ResourcesOverview,
  ResourcesPreviewResult,
  ResourcesValidationResult,
  Settings,
} from "../shared/ipc";
import { ModelPreview } from "./ModelPreview";
import { isModelResult } from "./model-preview-config";

// Studio cockpit. Sprites is wired to @shipshitgames/assetgen via the studio IPC bridge with a
// live streaming log. Provider + keys are configured once in Settings (topbar gear).
// Default provider = codex CLI (your subscription — no API key).

type SectionId = "projects" | "gyms" | "gallery" | "maps" | "sprites" | "music" | "3d" | "moodboard" | "lab" | "resources" | "codegen";
type Group = "Generators" | "Art Direction" | "Resources" | "Codegen";
type Section = { id: SectionId; label: string; group: Group; glyph: string; blurb: string };

const SECTIONS: Section[] = [
  { id: "projects", label: "Projects", group: "Codegen", glyph: "⌂", blurb: "Local game repos, target manifests, and asset catalogs." },
  { id: "gyms", label: "Gyms", group: "Codegen", glyph: "▣", blurb: "Per-game validation surfaces for animation, bounds, hit frames, and tuning." },
  { id: "maps", label: "Maps", group: "Generators", glyph: "▞", blurb: "Breach-zone layouts and arena maps for the Scourge front." },
  { id: "sprites", label: "Sprites", group: "Generators", glyph: "✦", blurb: "Forge DOOM-grade billboards and enemy cutouts — straight into a game's assets." },
  { id: "music", label: "Music + SFX", group: "Generators", glyph: "♪", blurb: "Brutal scores and combat SFX for the shipshitshow." },
  { id: "3d", label: "3D", group: "Generators", glyph: "◈", blurb: "Meshes, props and Warden engineering for the 3D titles." },
  { id: "gallery", label: "Gallery", group: "Art Direction", glyph: "▤", blurb: "Review and compare every generated asset in a game's pack — sprites, tiers, textures, UI." },
  { id: "moodboard", label: "Moodboard", group: "Art Direction", glyph: "▦", blurb: "Per-game reference boards for notes, images, and locked visual targets." },
  { id: "lab", label: "Lab", group: "Art Direction", glyph: "⌖", blurb: "Forge styled variants of one subject, score and tag them, then lock the winning look as the game's style target." },
  { id: "resources", label: "Resources", group: "Resources", glyph: "📖", blurb: "Inspect sources, transcript records, derivative candidates, and distill reviewed build rules." },
  { id: "codegen", label: "Codegen", group: "Codegen", glyph: "λ", blurb: "Plan → Review → Execute → Verify → Ship over the local CLI." },
];
const GROUPS: Group[] = ["Generators", "Art Direction", "Resources", "Codegen"];

const PROVIDERS = [
  { id: "codex", label: "Codex CLI — your subscription (no key)" },
  { id: "openai", label: "OpenAI API (gpt-image-2)" },
  { id: "fal", label: "fal.ai (FLUX)" },
  { id: "replicate", label: "Replicate" },
  { id: "suno", label: "Suno" },
  { id: "mock", label: "Mock (offline test)" },
];
const KEYED = [
  { id: "openai", label: "OpenAI" },
  { id: "fal", label: "fal.ai" },
  { id: "replicate", label: "Replicate" },
  { id: "meshy", label: "Meshy" },
  { id: "tripo", label: "Tripo" },
  { id: "suno", label: "Suno" },
];
const ASSET_DEFAULTS = [
  { kind: "sprite", label: "Sprites" },
  { kind: "texture", label: "Textures" },
  { kind: "icon", label: "Icons" },
  { kind: "map", label: "Maps" },
  { kind: "music", label: "Music" },
  { kind: "sfx", label: "SFX" },
  { kind: "voice", label: "Voice" },
  { kind: "model", label: "Models" },
];
function withSettingsDefaults(settings: Partial<Settings>): Settings {
  return {
    defaultProvider: settings.defaultProvider || "codex",
    defaultGame: settings.defaultGame || "scourge-survivors",
    // providerDefaults passes through: settings:get/set already normalize it
    // against assetgen's catalog (DEFAULT_PROVIDER_BY_KIND) in the main process,
    // so the renderer no longer keeps its own drifted routing copy (#194). The
    // dropdowns below fall back to the catalog (over studio:models) then
    // defaultProvider for any kind not yet present.
    providerDefaults: { ...(settings.providerDefaults || {}) },
    falModelDefaults: settings.falModelDefaults || {},
    activeProjectId: settings.activeProjectId || "",
    projects: settings.projects || [],
  };
}

const EMPTY_PROJECT_STATE: ProjectState = { projects: [], activeProjectId: "", activeManifestPath: null };

function activeProject(projectState: ProjectState): ProjectSummary | null {
  return projectState.projects.find((project) => project.id === projectState.activeProjectId) || projectState.projects[0] || null;
}

function kindSummary(kindCounts: Record<string, number>): string {
  const entries = Object.entries(kindCounts).sort(([a], [b]) => a.localeCompare(b));
  return entries.length ? entries.map(([kind, count]) => `${kind} ${count}`).join(" · ") : "no assets";
}

function SettingsPane() {
  const [settings, setSettings] = useState<Settings>(() => withSettingsDefaults({}));
  const [games, setGames] = useState<string[]>(["scourge-survivors"]);
  const [status, setStatus] = useState<Record<string, boolean>>({});
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [falModels, setFalModels] = useState<FalModelInfo[]>([]);
  // Catalog facts sourced from assetgen over studio:models (the single source of
  // truth), not local copies: the per-kind routing defaults and the set of kinds
  // fal can render. Both seed UI fallbacks; settings:get/set stay authoritative.
  const [catalogDefaults, setCatalogDefaults] = useState<Record<string, string>>({});
  const [falModelKinds, setFalModelKinds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    window.studio?.settings.get().then((s) => setSettings(withSettingsDefaults(s))).catch(() => {});
    window.studio?.keys.status().then(setStatus).catch(() => {});
    window.studio?.models?.list().then((m) => {
      setFalModels(m?.fal || []);
      setCatalogDefaults(m?.defaultProviderByKind || {});
      setFalModelKinds(new Set(m?.falImageKinds || []));
    }).catch(() => {});
    window.studio?.projects.list().then((state) => {
      const slugs = state.projects.map((project) => project.slug);
      if (slugs.length) setGames(slugs);
    }).catch(() => {
      window.studio?.listGames().then((g) => g?.length && setGames(g)).catch(() => {});
    });
  }, []);

  const update = (p: Partial<Settings>) => window.studio?.settings.set(p).then((s) => setSettings(withSettingsDefaults(s))).catch(() => {});
  const updateKindProvider = (kind: string, provider: string) => update({
    providerDefaults: { ...settings.providerDefaults, [kind]: provider },
  });
  // Empty value = "provider default": delete the key instead of storing "".
  const updateKindFalModel = (kind: string, model: string) => {
    const falModelDefaults = { ...settings.falModelDefaults };
    if (model) falModelDefaults[kind] = model;
    else delete falModelDefaults[kind];
    update({ falModelDefaults });
  };
  const saveKey = (provider: string) => {
    const key = inputs[provider];
    if (!key) return;
    window.studio?.keys.set(provider, key).then((s) => { setStatus(s); setInputs((k) => ({ ...k, [provider]: "" })); }).catch(() => {});
  };

  return (
    <div className="settings">
      <div className="set-group">
        <div className="set-group-title">Defaults</div>
        <label className="set-field"><span>Fallback provider</span>
          <select value={settings.defaultProvider} onChange={(e) => update({ defaultProvider: e.target.value })}>
            {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        <label className="set-field"><span>Default game</span>
          <select value={settings.defaultGame} onChange={(e) => update({ defaultGame: e.target.value })}>
            {games.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
      </div>
      <div className="set-group">
        <div className="set-group-title">Provider by asset type</div>
        {ASSET_DEFAULTS.map((item) => (
          <label className="set-provider-row" key={item.kind}>
            <span>{item.label}</span>
            <select value={settings.providerDefaults[item.kind] || catalogDefaults[item.kind] || settings.defaultProvider} onChange={(e) => updateKindProvider(item.kind, e.target.value)}>
              {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
        ))}
      </div>
      <div className="set-group">
        <div className="set-group-title">fal.ai model by asset type</div>
        {ASSET_DEFAULTS.flatMap((item) => {
          if (!falModelKinds.has(item.kind)) return [];
          const chosen = settings.falModelDefaults[item.kind] || "";
          return [(
            <label className="set-provider-row" key={item.kind}>
              <span>{item.label}</span>
              <select value={chosen} onChange={(e) => updateKindFalModel(item.kind, e.target.value)}>
                <option value="">Provider default (FLUX.1 dev)</option>
                {falModels.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                {chosen && !falModels.some((m) => m.id === chosen) && <option value={chosen}>{chosen} (custom)</option>}
              </select>
            </label>
          )];
        })}
      </div>
      <div className="set-group">
        <div className="set-group-title">API keys — only for key-based providers</div>
        <p className="gen-note">Codex uses your ChatGPT/Codex subscription — no key needed. Key-based providers are stored in your macOS keychain.</p>
        {KEYED.map((k) => (
          <div className="set-key-row" key={k.id}>
            <span className="label">{k.label}</span>
            <input type="password" aria-label={`${k.label} API key`} placeholder={status[k.id] ? "•••••••• stored" : "paste key"} value={inputs[k.id] || ""} onChange={(e) => setInputs((s) => ({ ...s, [k.id]: e.target.value }))} />
            <button className="set-btn" type="button" onClick={() => saveKey(k.id)}>Save</button>
            <span className={"badge " + (status[k.id] ? "ok" : "no")}>{status[k.id] ? "set" : "none"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProjectsPane() {
  const [projectState, setProjectState] = useState<ProjectState>(EMPTY_PROJECT_STATE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const current = activeProject(projectState);

  useEffect(() => {
    window.studio?.projects.list().then(setProjectState).catch((e) => setError(String((e as Error)?.message ?? e)));
  }, []);

  async function addProject() {
    if (!window.studio?.projects) { setError("studio bridge unavailable"); return; }
    setBusy(true);
    setError("");
    try {
      setProjectState(await window.studio.projects.add());
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function setActiveProject(id: string) {
    if (!window.studio?.projects) return;
    setBusy(true);
    setError("");
    try {
      setProjectState(await window.studio.projects.setActive(id));
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function removeProject(id: string) {
    if (!window.studio?.projects) return;
    setBusy(true);
    setError("");
    try {
      setProjectState(await window.studio.projects.remove(id));
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="projects">
      <div className="projects-toolbar">
        <button className="set-btn" type="button" disabled={busy} onClick={addProject}>Add game repo...</button>
        <div className="project-active-path">{current?.manifestPath || "no manifest target"}</div>
      </div>
      {error && <div className="project-error">{error}</div>}
      {projectState.projects.length ? (
        <div className="project-list">
          {projectState.projects.map((project) => (
            <article className={"project-card" + (project.isActive ? " is-active" : "")} key={project.id}>
              <div className="project-main">
                <div className="project-title">
                  <strong>{project.name}</strong>
                  <span>{project.slug}</span>
                  <span className={"badge " + (project.valid ? "ok" : "no")}>{project.valid ? "valid" : "invalid"}</span>
                </div>
                <div className="project-path">{project.repoPath}</div>
                <div className="project-manifest">{project.manifestPath}</div>
                <div className="project-kinds">{kindSummary(project.kindCounts)}</div>
                {project.error && <div className="project-error">{project.error}</div>}
                <div className="project-catalog">
                  {project.assets.length ? project.assets.slice(0, 12).map((asset) => (
                    <span className="project-asset" key={`${asset.kind}:${asset.id}`}>{asset.kind}:{asset.id}</span>
                  )) : <span className="project-empty">catalog empty</span>}
                  {project.catalogTruncated && <span className="project-empty">+ more</span>}
                </div>
              </div>
              <div className="project-actions">
                <button className="set-btn" type="button" disabled={busy || project.isActive} onClick={() => setActiveProject(project.id)}>
                  {project.isActive ? "Active" : "Use"}
                </button>
                {project.source === "registered" && (
                  <button className="set-btn is-danger" type="button" disabled={busy} onClick={() => removeProject(project.id)}>Remove</button>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="placeholder-card">
          <div className="placeholder-glyph" aria-hidden="true">⌂</div>
          <p><strong>No local projects registered.</strong></p>
        </div>
      )}
    </div>
  );
}

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

function GymsPane() {
  const [state, setState] = useState<GymsState>(EMPTY_GYMS_STATE);
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [launching, setLaunching] = useState("");
  const [message, setMessage] = useState<GymLaunchResult | null>(null);
  const [error, setError] = useState("");
  const project = activeGymProject(state, projectId);

  const load = useCallback(async () => {
    if (!window.studio?.gyms) {
      setError("studio bridge unavailable");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const next = await window.studio.gyms.list();
      setState(next);
      setProjectId((current) => (next.projects.some((project) => project.id === current) ? current : next.activeProjectId));
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function launch(gym: GymSummary) {
    if (!window.studio?.gyms || !project) {
      setError("studio bridge unavailable");
      return;
    }
    setLaunching(gym.id);
    setMessage(null);
    setError("");
    try {
      const result = await window.studio.gyms.launch(project.id, gym.id);
      setMessage(result);
      if (!result.ok) setError(result.error || "launch failed");
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setLaunching("");
    }
  }

  return (
    <div className="gyms">
      <aside className="gym-sidebar">
        <div className="gym-sidebar-head">
          <span>Projects</span>
          <button className="set-btn" type="button" disabled={busy} onClick={() => void load()}>{busy ? "Loading…" : "Reload"}</button>
        </div>
        {state.projects.length ? (
          <div className="gym-project-list">
            {state.projects.map((candidate) => (
              <button
                type="button"
                key={candidate.id}
                className={"gym-project" + (candidate.id === project?.id ? " is-active" : "")}
                onClick={() => { setProjectId(candidate.id); setMessage(null); setError(""); }}
              >
                <strong>{candidate.name}</strong>
                <span>{candidate.slug}</span>
                <b>{candidate.gyms.length}</b>
              </button>
            ))}
          </div>
        ) : (
          <div className="gym-empty">no local projects</div>
        )}
      </aside>

      <section className="gym-main" aria-label="Gyms">
        {project ? (
          <>
            <div className="gym-project-head">
              <div>
                <h2>{project.name}</h2>
                <div className="gym-path">{project.repoPath}</div>
              </div>
              <span className={"badge " + (project.declarationExists && !project.error ? "ok" : "no")}>
                {project.declarationExists ? "declared" : "none"}
              </span>
            </div>
            <div className="gym-path">declaration {project.declarationPath}</div>
            {project.error && <pre className="gen-log is-err">{project.error}</pre>}
            {error && <pre className="gen-log is-err">{error}</pre>}
            {message?.ok && (
              <div className="gym-result">
                <strong>{message.label || "Gym"} launched</strong>
                <span>{message.command ? `${message.command} ${(message.args || []).join(" ")}` : message.url}</span>
                {message.pid ? <span>pid {message.pid}</span> : null}
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
                    {gym.url && <div className="gym-url">{gym.url}</div>}
                    <button className="gen-btn gym-launch" type="button" disabled={!!launching} onClick={() => void launch(gym)}>
                      {launching === gym.id ? "Launching…" : "Launch"}
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="gym-empty is-large">
                <span>no gyms declared</span>
                <b>{project.slug}</b>
              </div>
            )}
          </>
        ) : (
          <div className="gym-empty is-large">
            <span>no projects available</span>
          </div>
        )}
      </section>
    </div>
  );
}

// Pixelize step (#66): after a sprite is generated, re-grade it onto the true DOOM
// pixel grid — rembg/flood-fill cutout → box-downscale to the grid height →
// nearest-quantize to the fixed ramp → lossless webp — and show a before/after.
// Runs the SAME assetgen pixelize() the CLI uses, over studio:pixelize.
const PIXELIZE_CUTOUTS = [
  { id: "auto", label: "auto (rembg → flood)" },
  { id: "rembg", label: "rembg (segmentation)" },
  { id: "flood", label: "flood-fill (near-black)" },
  { id: "none", label: "none" },
];

function PixelizePanel({ source }: { source: { dataUrl?: string | null; path?: string | null } }) {
  const [height, setHeight] = useState(110);
  const [bg, setBg] = useState(42);
  const [cutout, setCutout] = useState("auto");
  const [palette, setPalette] = useState("doom");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<PixelizeResult | null>(null);
  const [err, setErr] = useState("");

  // A fresh generation invalidates the previous pixelize output. The parent remounts
  // this panel via `key` on each new source (React's "reset state with a key"), so the
  // before/after never carries over a stale result — no effect, no derived state.
  const hasSource = !!(source.dataUrl || source.path);

  async function run() {
    if (!window.studio?.pixelize) { setErr("studio bridge unavailable — restart the app"); return; }
    if (!hasSource) { setErr("nothing to pixelize — generate a sprite first"); return; }
    setBusy(true);
    setErr("");
    try {
      const result = await window.studio.pixelize({
        dataUrl: source.dataUrl ?? undefined,
        path: source.path ?? undefined,
        height,
        bgThreshold: bg,
        cutout,
        palette,
      });
      if (!result.ok) { setErr(result.error || "pixelize failed"); setOut(null); }
      else setOut(result);
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pixelize-step">
      <div className="pixelize-head">
        <span className="pixelize-title">Pixelize</span>
        <span className="pixelize-sub">snap to a true DOOM pixel grid</span>
      </div>
      <div className="pixelize-controls">
        <label className="gen-field"><span>Grid height</span>
          <input type="number" min={16} max={512} value={height}
            onChange={(e) => setHeight(Math.max(16, Math.min(512, Number(e.target.value) || 110)))} />
        </label>
        <div className="pixelize-presets">
          <button type="button" className={height === 110 ? "is-on" : ""} onClick={() => setHeight(110)}>rank-and-file · 110</button>
          <button type="button" className={height === 180 ? "is-on" : ""} onClick={() => setHeight(180)}>boss · 180</button>
        </div>
        <label className="gen-field"><span>BG threshold</span>
          <input type="number" min={0} max={255} value={bg}
            onChange={(e) => setBg(Math.max(0, Math.min(255, Number(e.target.value) || 0)))} />
        </label>
        <label className="gen-field"><span>Cutout</span>
          <select value={cutout} onChange={(e) => setCutout(e.target.value)}>
            {PIXELIZE_CUTOUTS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label className="gen-field"><span>Palette</span>
          <select value={palette} onChange={(e) => setPalette(e.target.value)}>
            <option value="doom">DOOM ramp</option>
          </select>
        </label>
      </div>
      <button className="gen-btn pixelize-btn" type="button" disabled={busy || !hasSource} onClick={run}>
        {busy ? "Pixelizing…" : "Pixelize"}
      </button>
      {err && <div className="project-error">{err}</div>}
      <div className="pixelize-ba">
        <figure className="pixelize-cell">
          <figcaption>before</figcaption>
          {source.dataUrl
            ? <img className="pixelize-img" src={source.dataUrl} alt="before pixelize" />
            : <div className="gen-preview-empty">—</div>}
        </figure>
        <figure className="pixelize-cell">
          <figcaption>after{out?.cutout?.tool ? ` · ${out.cutout.tool}` : ""}</figcaption>
          {out?.dataUrl
            ? <img className="pixelize-img is-pixelated" src={out.dataUrl} alt="after pixelize" />
            : <div className="gen-preview-empty">{busy ? "pixelizing…" : "pixelize"}</div>}
        </figure>
      </div>
    </div>
  );
}

function SpritesPane() {
  const [id, setId] = useState("swarm-husk");
  const [prompt, setPrompt] = useState("a rotting bio-husk of the Scourge, mid-lunge, gore");
  const [game, setGame] = useState("scourge-survivors");
  const [games, setGames] = useState<string[]>(["scourge-survivors"]);
  const [projectState, setProjectState] = useState<ProjectState>(EMPTY_PROJECT_STATE);
  const [projectId, setProjectId] = useState("");
  const [provider, setProvider] = useState("codex");
  const [falModel, setFalModel] = useState("");
  const [views, setViews] = useState("front,side,back");
  const [frames, setFrames] = useState(1);
  const [fps, setFps] = useState(8);
  const [scale, setScale] = useState(1);
  const [license, setLicense] = useState("ai-generated; review before shipping");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState("");
  const [result, setResult] = useState<GenResult | null>(null);
  const selectedProject = projectState.projects.find((project) => project.id === projectId) || activeProject(projectState);

  useEffect(() => {
    window.studio?.settings.get().then((s) => {
      const next = withSettingsDefaults(s);
      setProvider(next.providerDefaults.sprite || next.defaultProvider);
      setFalModel(next.falModelDefaults.sprite || "");
      setGame(next.defaultGame);
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
    const off = window.studio?.onGenLog((chunk) => setLog((l) => (l + chunk).slice(-8000)));
    return () => { off?.(); };
  }, []);

  async function changeProject(id: string) {
    setProjectId(id);
    const next = await window.studio?.projects.setActive(id);
    if (!next) return;
    setProjectState(next);
    const current = activeProject(next);
    if (current) setGame(current.slug);
  }

  async function generate() {
    if (!window.studio?.generate) { setLog("studio bridge unavailable — restart the app"); return; }
    if (selectedProject && !selectedProject.valid) { setLog(selectedProject.error || "invalid project manifest"); return; }
    setBusy(true);
    setResult(null);
    setLog("");
    try {
      setResult(await window.studio.generate({
        id,
        prompt,
        game: selectedProject?.slug || game,
        projectId: selectedProject?.id,
        kind: "sprite",
        provider,
        views,
        frames,
        fps,
        anchor: "0.5,1",
        scale,
        license,
      }));
    } catch (e) {
      setLog(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gen">
      <div className="gen-form">
        <label className="gen-field"><span>Asset ID</span>
          <input value={id} onChange={(e) => setId(e.target.value)} placeholder="swarm-husk" />
        </label>
        <label className="gen-field gen-grow"><span>Prompt</span>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} />
        </label>
        <label className="gen-field"><span>Game</span>
          <select value={selectedProject ? selectedProject.id : game} onChange={(e) => {
            if (projectState.projects.length) void changeProject(e.target.value);
            else setGame(e.target.value);
          }}>
            {projectState.projects.length
              ? projectState.projects.map((project) => <option key={project.id} value={project.id}>{project.name} · {project.slug}</option>)
              : games.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        <div className="gen-row">
          <label className="gen-field"><span>Views</span>
            <select value={views} onChange={(e) => setViews(e.target.value)}>
              <option value="front">front</option>
              <option value="front,side,back">front / side / back</option>
              <option value="front,three-quarter,side,back">4-way billboard</option>
              <option value="front,front-right,right,back-right,back,back-left,left,front-left">8-way billboard</option>
            </select>
          </label>
          <label className="gen-field"><span>Frames</span>
            <input type="number" min={1} max={16} value={frames} onChange={(e) => setFrames(Math.max(1, Math.min(16, Number(e.target.value) || 1)))} />
          </label>
        </div>
        <div className="gen-row">
          <label className="gen-field"><span>FPS</span>
            <input type="number" min={1} max={30} value={fps} onChange={(e) => setFps(Math.max(1, Math.min(30, Number(e.target.value) || 8)))} />
          </label>
          <label className="gen-field"><span>World scale</span>
            <input type="number" min={0.1} max={20} step={0.1} value={scale} onChange={(e) => setScale(Math.max(0.1, Number(e.target.value) || 1))} />
          </label>
        </div>
        <label className="gen-field"><span>License record</span>
          <input value={license} onChange={(e) => setLicense(e.target.value)} />
        </label>
        <div className="gen-active">sprite provider <b>{provider}</b>{provider === "fal" && <> · model <b>{falModel || "flux dev default"}</b></>} · change in Settings (topbar ⚙)</div>
        {selectedProject?.manifestPath && <div className="gen-manifest">manifest {selectedProject.manifestPath}</div>}
        {selectedProject && !selectedProject.valid && <div className="project-error">{selectedProject.error}</div>}
        <button className="gen-btn" type="button" disabled={busy || !id || !prompt || !!(selectedProject && !selectedProject.valid)} onClick={generate}>
          {busy ? "Forging…" : "Generate"}
        </button>
        <p className="gen-note">Auto-styled with the DOOM DESIGN.md suffix · writes the .webp + updates the game's assets.json. Codex runs take a minute — watch the log.</p>
      </div>
      <div className="gen-preview">
        {result?.dataUrl ? (
          <div className="billboard-stage">
            <div className="billboard-floor" />
            <img className="billboard-sprite" src={result.dataUrl} alt={id} />
          </div>
        ) : <div className="gen-preview-empty">{busy ? "forging…" : "preview"}</div>}
        {(log || result) && <pre className={"gen-log" + (result && !result.ok ? " is-err" : "")}>{log || "—"}</pre>}
        {result?.path && <div className="gen-path">{result.path}</div>}
        {result?.previewPath && <div className="gen-path">{result.previewPath}</div>}
        {result?.ok && result.dataUrl && <PixelizePanel key={result.dataUrl} source={{ dataUrl: result.dataUrl, path: result.path }} />}
      </div>
    </div>
  );
}

// 3D pane (issue #20): drives @shipshitgames/assetgen's model pipeline — provider
// GLB → mandatory gltf-transform optimize (Draco geometry, encoder-gated KTX2 else
// WebP textures) → manifest entry — then previews the optimized GLB in-process with
// the Draco+KTX2-wired three.js loader (ModelPreview).
const MODEL_PROVIDERS = ["meshy", "tripo", "mock"];

function ModelPane() {
  const [id, setId] = useState("stone-golem");
  const [prompt, setPrompt] = useState("a hulking moss-covered stone golem, game-ready, neutral T-pose");
  const [game, setGame] = useState("scourge-survivors");
  const [games, setGames] = useState<string[]>(["scourge-survivors"]);
  const [projectState, setProjectState] = useState<ProjectState>(EMPTY_PROJECT_STATE);
  const [projectId, setProjectId] = useState("");
  const [provider, setProvider] = useState("meshy");
  const [rig, setRig] = useState("");
  const [draco, setDraco] = useState(true);
  const [ktx2, setKtx2] = useState(false);
  const [license, setLicense] = useState("ai-generated; review 3D + rig license before shipping");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState("");
  const [result, setResult] = useState<GenResult | null>(null);
  const selectedProject = projectState.projects.find((project) => project.id === projectId) || activeProject(projectState);

  useEffect(() => {
    window.studio?.settings.get().then((s) => {
      const next = withSettingsDefaults(s);
      setProvider(next.providerDefaults.model || next.providerDefaults["3d"] || "meshy");
      setGame(next.defaultGame);
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
    const off = window.studio?.onGenLog((chunk) => setLog((l) => (l + chunk).slice(-8000)));
    return () => { off?.(); };
  }, []);

  async function changeProject(id: string) {
    setProjectId(id);
    const next = await window.studio?.projects.setActive(id);
    if (!next) return;
    setProjectState(next);
    const current = activeProject(next);
    if (current) setGame(current.slug);
  }

  async function generate() {
    if (!window.studio?.generate) { setLog("studio bridge unavailable — restart the app"); return; }
    if (selectedProject && !selectedProject.valid) { setLog(selectedProject.error || "invalid project manifest"); return; }
    setBusy(true);
    setResult(null);
    setLog("");
    try {
      setResult(await window.studio.generate({
        id,
        prompt,
        game: selectedProject?.slug || game,
        projectId: selectedProject?.id,
        kind: "model",
        provider,
        draco,
        ktx2,
        rig: rig.trim() || undefined,
        license,
      }));
    } catch (e) {
      setLog(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  const showPreview = !!result?.dataUrl && isModelResult(result?.mediaType);

  return (
    <div className="gen">
      <div className="gen-form">
        <label className="gen-field"><span>Asset ID</span>
          <input value={id} onChange={(e) => setId(e.target.value)} placeholder="stone-golem" />
        </label>
        <label className="gen-field gen-grow"><span>Prompt</span>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} />
        </label>
        <label className="gen-field"><span>Game</span>
          <select value={selectedProject ? selectedProject.id : game} onChange={(e) => {
            if (projectState.projects.length) void changeProject(e.target.value);
            else setGame(e.target.value);
          }}>
            {projectState.projects.length
              ? projectState.projects.map((project) => <option key={project.id} value={project.id}>{project.name} · {project.slug}</option>)
              : games.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        <div className="gen-row">
          <label className="gen-field"><span>Provider</span>
            <select value={provider} onChange={(e) => setProvider(e.target.value)}>
              {MODEL_PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="gen-field"><span>Rig source</span>
            <input value={rig} onChange={(e) => setRig(e.target.value)} placeholder="provider default" />
          </label>
        </div>
        <div className="gen-row">
          <label className="gen-check"><input type="checkbox" checked={draco} onChange={(e) => setDraco(e.target.checked)} /><span>Draco geometry</span></label>
          <label className="gen-check"><input type="checkbox" checked={ktx2} onChange={(e) => setKtx2(e.target.checked)} /><span>KTX2 textures (else WebP)</span></label>
        </div>
        <label className="gen-field"><span>License record</span>
          <input value={license} onChange={(e) => setLicense(e.target.value)} />
        </label>
        <div className="gen-active">3D provider <b>{provider}</b> · optimize: Draco {draco ? "on" : "off"} · textures {ktx2 ? "KTX2→WebP fallback" : "WebP"} · change defaults in Settings (topbar ⚙)</div>
        {selectedProject?.manifestPath && <div className="gen-manifest">manifest {selectedProject.manifestPath}</div>}
        {selectedProject && !selectedProject.valid && <div className="project-error">{selectedProject.error}</div>}
        <button className="gen-btn" type="button" disabled={busy || !id || !prompt || !!(selectedProject && !selectedProject.valid)} onClick={generate}>
          {busy ? "Sculpting…" : "Generate"}
        </button>
        <p className="gen-note">Drives Meshy/Tripo (or mock), runs the mandatory gltf-transform optimize, writes the .glb + records optimized/compression/animations + a license.rig entry. KTX2 needs a KTX-Software encoder; without one, textures fall back to WebP.</p>
      </div>
      <div className="gen-preview">
        {showPreview ? (
          <ModelPreview src={result!.dataUrl!} label={id} />
        ) : <div className="gen-preview-empty">{busy ? "sculpting…" : "preview"}</div>}
        {(log || result) && <pre className={"gen-log" + (result && !result.ok ? " is-err" : "")}>{log || "—"}</pre>}
        {result?.path && <div className="gen-path">{result.path}</div>}
      </div>
    </div>
  );
}

function slugFromUrl(url: string): string {
  const m = url.match(/(?:v=|youtu\.be\/|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1].toLowerCase() : "ruleset";
}

const EMPTY_RESOURCES_OVERVIEW: ResourcesOverview = {
  ok: false,
  error: null,
  sources: { schemaVersion: 1, count: 0, items: [], errors: [], warnings: [] },
  transcripts: { schemaVersion: 1, count: 0, items: [], errors: [], warnings: [] },
  derivatives: { schemaVersion: 1, count: 0, items: [], errors: [], warnings: [] },
};

type ResourceInventoryTab = "sources" | "transcripts" | "derivatives";

function ResourcesPane() {
  const [url, setUrl] = useState("");
  const [slug, setSlug] = useState("");
  const [provider, setProvider] = useState("codex");
  const [distillBusy, setDistillBusy] = useState(false);
  const [inventoryBusy, setInventoryBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState("");
  const [log, setLog] = useState("");
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [overview, setOverview] = useState<ResourcesOverview>(EMPTY_RESOURCES_OVERVIEW);
  const [validation, setValidation] = useState<ResourcesValidationResult | null>(null);
  const [tab, setTab] = useState<ResourceInventoryTab>("sources");
  const [preview, setPreview] = useState<ResourcesPreviewResult | null>(null);
  const [selectedDerivative, setSelectedDerivative] = useState<ResourceDerivativeItem | null>(null);
  const [reviewedSkillPath, setReviewedSkillPath] = useState("");

  const loadOverview = useCallback(async () => {
    if (!window.studio?.resources) {
      setOverview({ ...EMPTY_RESOURCES_OVERVIEW, error: "studio bridge unavailable — restart the app" });
      return;
    }
    setInventoryBusy(true);
    try {
      setOverview(await window.studio.resources.list());
    } catch (error) {
      setOverview({
        ...EMPTY_RESOURCES_OVERVIEW,
        error: String((error as Error)?.message ?? error),
      });
    } finally {
      setInventoryBusy(false);
    }
  }, []);

  const validateResources = useCallback(async () => {
    if (!window.studio?.resources) return;
    setActionBusy("validate");
    setLog("");
    try {
      setValidation(await window.studio.resources.validate());
    } catch (error) {
      setLog(String((error as Error)?.message ?? error));
    } finally {
      setActionBusy("");
    }
  }, []);

  useEffect(() => {
    // Ressources distills with codex | mock only, not the image-gen providers.
    const off = window.studio?.onResearchLog((chunk) => setLog((l) => (l + chunk).slice(-8000)));
    return () => { off?.(); };
  }, []);

  useEffect(() => {
    void loadOverview();
    void validateResources();
  }, [loadOverview, validateResources]);

  async function distill() {
    if (!window.studio?.research) { setLog("studio bridge unavailable — restart the app"); return; }
    setDistillBusy(true);
    setResult(null);
    setLog("");
    try {
      setResult(await window.studio.research({ url: url.trim(), slug: (slug.trim() || slugFromUrl(url)), provider }));
    } catch (e) {
      setLog(String((e as Error)?.message ?? e));
    } finally {
      setDistillBusy(false);
    }
  }

  async function previewDerivativeItem(item: ResourceDerivativeItem) {
    if (!window.studio?.resources) return;
    setActionBusy(`preview:${item.path}`);
    setSelectedDerivative(item);
    setReviewedSkillPath("");
    try {
      setPreview(await window.studio.resources.preview(item.outputPath));
    } catch (error) {
      setPreview({ ok: false, path: null, content: null, error: String((error as Error)?.message ?? error) });
    } finally {
      setActionBusy("");
    }
  }

  async function revealDerivative(item: ResourceDerivativeItem) {
    if (!window.studio?.resources) return;
    const revealed = await window.studio.resources.reveal(item.outputPath || item.path);
    if (!revealed.ok) setLog(revealed.error || "could not reveal derivative");
  }

  async function promoteSkill(item: ResourceDerivativeItem, approve: boolean) {
    if (!window.studio?.resources || item.kind !== "skill") return;
    setActionBusy(`${approve ? "approve" : "review"}:${item.path}`);
    setLog("");
    try {
      const action = await window.studio.resources.promoteSkill(item.path, approve);
      setLog(action.log || action.error || "");
      if (action.ok && !approve) setReviewedSkillPath(item.path);
      if (action.ok && approve) {
        setReviewedSkillPath("");
        await loadOverview();
      }
    } catch (error) {
      setLog(String((error as Error)?.message ?? error));
    } finally {
      setActionBusy("");
    }
  }

  const validationCounts = validation?.counts;
  const validationLabel = actionBusy === "validate"
    ? "validating"
    : validation?.ok
      ? "valid"
      : validation
        ? "needs attention"
        : "not checked";

  return (
    <div className="resources">
      <div className="resources-toolbar">
        <div className={"resources-validation " + (validation?.ok ? "is-valid" : validation ? "is-invalid" : "")}>
          <span className="resources-status-dot" />
          <strong>{validationLabel}</strong>
          {validationCounts && (
            <span>
              {validationCounts.sources} sources · {validationCounts.transcripts} transcripts · {validationCounts.derivatives} derivatives
            </span>
          )}
        </div>
        <div className="resources-toolbar-actions">
          <button className="set-btn" type="button" disabled={inventoryBusy} onClick={() => void loadOverview()}>
            {inventoryBusy ? "Loading…" : "Reload inventory"}
          </button>
          <button className="set-btn" type="button" disabled={actionBusy === "validate"} onClick={() => void validateResources()}>
            Validate
          </button>
        </div>
      </div>

      <div className="resources-layout">
        <aside className="resources-inventory">
          <div className="resources-tabs" role="tablist" aria-label="Resource inventory">
            {(["sources", "transcripts", "derivatives"] as ResourceInventoryTab[]).map((kind) => (
              <button
                key={kind}
                type="button"
                role="tab"
                aria-selected={tab === kind}
                className={tab === kind ? "is-active" : ""}
                onClick={() => setTab(kind)}
              >
                {kind} <b>{overview[kind].count}</b>
              </button>
            ))}
          </div>

          <div className="resources-list">
            {overview.error && <div className="resources-error">{overview.error}</div>}
            {tab === "sources" && overview.sources.items.map((item: ResourceSourceItem) => (
              <article className="resource-card" key={item.path}>
                <div className="resource-card-head">
                  <strong>{item.title}</strong>
                  <span>{item.status}</span>
                </div>
                <p>{item.slug} · {item.kind} · {item.transcriptCount} transcripts</p>
                <div className="resource-tags">
                  {item.topics.slice(0, 4).map((topic) => <span key={topic}>{topic}</span>)}
                </div>
              </article>
            ))}
            {tab === "transcripts" && overview.transcripts.items.map((item: ResourceTranscriptItem) => (
              <article className="resource-card" key={item.path}>
                <div className="resource-card-head">
                  <strong>{item.title}</strong>
                  <span className={item.rightsStatus ? "is-rights" : ""}>{item.rightsStatus || "rights unknown"}</span>
                </div>
                <p>{item.sourceSlug} · {item.transcriptFormat} · {item.derivativeCount} candidates</p>
                <code>{item.path}</code>
              </article>
            ))}
            {tab === "derivatives" && overview.derivatives.items.map((item: ResourceDerivativeItem) => (
              <article
                className={"resource-card is-actionable" + (selectedDerivative?.path === item.path ? " is-selected" : "")}
                key={item.path}
              >
                <div className="resource-card-head">
                  <strong>{item.title}</strong>
                  <span>{item.kind} · {item.status}</span>
                </div>
                <p>{item.summary || `${item.sourceTranscriptCount} source transcripts`}</p>
                <div className="resource-card-actions">
                  <button
                    className="set-btn"
                    type="button"
                    disabled={actionBusy === `preview:${item.path}`}
                    onClick={() => void previewDerivativeItem(item)}
                  >
                    Review
                  </button>
                  <button className="set-btn" type="button" onClick={() => void revealDerivative(item)}>Reveal</button>
                  {item.kind === "skill" && (
                    <button
                      className="set-btn"
                      type="button"
                      disabled={actionBusy === `review:${item.path}`}
                      onClick={() => void promoteSkill(item, false)}
                    >
                      Promotion check
                    </button>
                  )}
                  {item.kind === "skill" && reviewedSkillPath === item.path && (
                    <button
                      className="gen-btn resource-approve"
                      type="button"
                      disabled={actionBusy === `approve:${item.path}`}
                      onClick={() => void promoteSkill(item, true)}
                    >
                      Promote reviewed skill
                    </button>
                  )}
                </div>
              </article>
            ))}
            {!inventoryBusy && overview[tab].items.length === 0 && (
              <div className="resources-empty">No {tab} in the manifest inventory.</div>
            )}
          </div>
          <p className="resources-rights-note">
            Transcript bodies are never loaded into this pane. Only sidecar metadata and explicit rights status cross IPC.
          </p>
        </aside>

        <section className="resources-workspace">
          <div className="resources-distill">
            <div className="resources-section-head">
              <div>
                <span>Distill</span>
                <strong>Source → reviewed rules</strong>
              </div>
              <span>streaming CLI</span>
            </div>
            <div className="resources-distill-fields">
              <label className="gen-field gen-grow"><span>YouTube URL</span>
                <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" />
              </label>
              <label className="gen-field"><span>Rules file slug</span>
                <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder={url ? slugFromUrl(url) : "ruleset"} />
              </label>
              <label className="gen-field"><span>Provider</span>
                <select value={provider} onChange={(e) => setProvider(e.target.value)}>
                  <option value="codex">codex — subscription</option>
                  <option value="mock">mock — offline</option>
                </select>
              </label>
              <button className="gen-btn" type="button" disabled={distillBusy || !url.trim()} onClick={distill}>
                {distillBusy ? "Distilling…" : "Distill rules"}
              </button>
            </div>
          </div>

          <div className="resources-preview">
            <div className="resources-section-head">
              <div>
                <span>Review</span>
                <strong>{selectedDerivative?.title || (result?.path ? "Generated rules" : "Derivative preview")}</strong>
              </div>
              {(preview?.path || result?.path) && <code>{preview?.path || result?.path}</code>}
            </div>
            {preview?.content || result?.rules ? (
              <pre className="gen-rules">{preview?.content || result?.rules}</pre>
            ) : (
              <div className="resources-preview-empty">
                {distillBusy ? "distilling…" : "Select a derivative or distill a source to review its output."}
              </div>
            )}
            {preview && !preview.ok && <div className="resources-error">{preview.error}</div>}
            {(log || result) && <pre className={"gen-log" + (result && !result.ok ? " is-err" : "")}>{log || "—"}</pre>}
          </div>
        </section>
      </div>
    </div>
  );
}

// Per-category provider options for the Generate-from-prompt mode. suno stays the
// pipeline default for all three kinds; named perpetual-commercial providers
// (ElevenLabs SFX, Beatoven music — issue #21) are offered as selectable choices.
const AUDIO_PROVIDERS_BY_CATEGORY: Record<"sfx" | "music" | "voice", { id: string; label: string }[]> = {
  sfx: [
    { id: "elevenlabs", label: "ElevenLabs (SFX)" },
    { id: "suno", label: "Suno" },
    { id: "mock", label: "Mock (offline test)" },
  ],
  music: [
    { id: "beatoven", label: "Beatoven (music loops)" },
    { id: "suno", label: "Suno" },
    { id: "mock", label: "Mock (offline test)" },
  ],
  voice: [
    { id: "suno", label: "Suno" },
    { id: "mock", label: "Mock (offline test)" },
  ],
};
const defaultProviderForCategory = (category: "sfx" | "music" | "voice") => AUDIO_PROVIDERS_BY_CATEGORY[category][0].id;

// Music + SFX pane: two modes. "Generate" drives @shipshitgames/assetgen to make a
// music loop / SFX / voice clip from a prompt (named perpetual-commercial providers),
// encodes to WebM/Opus and registers it. "Transcode" brings your own audio file →
// WebM/Opus via ffmpeg. Both write into a game's src/assets/audio/<category>/.
function MusicPane() {
  const [mode, setMode] = useState<"generate" | "transcode">("generate");
  const [files, setFiles] = useState<string[]>([]);
  const [game, setGame] = useState("scourge-survivors");
  const [games, setGames] = useState<string[]>(["scourge-survivors"]);
  const [projectState, setProjectState] = useState<ProjectState>(EMPTY_PROJECT_STATE);
  const [projectId, setProjectId] = useState("");
  const [category, setCategory] = useState<"sfx" | "music" | "voice">("music");
  const [bitrate, setBitrate] = useState(128);
  const [normalize, setNormalize] = useState(false);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState("");
  const [result, setResult] = useState<{ ok: boolean; log: string; outputs: string[] } | null>(null);
  // Generate-mode state (shares category/bitrate/normalize with transcode).
  const [genId, setGenId] = useState("impact-hit");
  const [prompt, setPrompt] = useState("a brutal metallic impact hit, short and punchy");
  const [provider, setProvider] = useState(() => defaultProviderForCategory("music"));
  const [loop, setLoop] = useState(true);
  const [volume, setVolume] = useState(1);
  const [license, setLicense] = useState("perpetual commercial; review before shipping");
  const [genBusy, setGenBusy] = useState(false);
  const [genResult, setGenResult] = useState<GenResult | null>(null);
  const selectedProject = projectState.projects.find((project) => project.id === projectId) || activeProject(projectState);

  useEffect(() => {
    window.studio?.settings.get().then((s) => setGame(s.defaultGame)).catch(() => {});
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
    const offTranscode = window.studio?.onTranscodeLog((chunk) => setLog((l) => (l + chunk).slice(-8000)));
    const offGen = window.studio?.onGenLog((chunk) => setLog((l) => (l + chunk).slice(-8000)));
    return () => { offTranscode?.(); offGen?.(); };
  }, []);

  // Pick a sensible default provider + loop default when the category changes.
  function changeCategory(next: "sfx" | "music" | "voice") {
    setCategory(next);
    setProvider(defaultProviderForCategory(next));
    setLoop(next === "music");
  }

  async function changeProject(id: string) {
    setProjectId(id);
    const next = await window.studio?.projects.setActive(id);
    if (!next) return;
    setProjectState(next);
    const current = activeProject(next);
    if (current) setGame(current.slug);
  }

  async function pick() {
    const f = await window.studio?.pickAudioFiles();
    if (f?.length) setFiles(f);
  }

  async function transcode() {
    if (!window.studio?.transcodeAudio) { setLog("studio bridge unavailable — restart the app"); return; }
    if (selectedProject && !selectedProject.valid) { setLog(selectedProject.error || "invalid project manifest"); return; }
    setBusy(true);
    setResult(null);
    setLog("");
    try {
      setResult(await window.studio.transcodeAudio({
        files,
        game: selectedProject?.slug || game,
        projectId: selectedProject?.id,
        category,
        bitrate,
        normalize,
      }));
    } catch (e) {
      setLog(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    if (!window.studio?.generate) { setLog("studio bridge unavailable — restart the app"); return; }
    if (selectedProject && !selectedProject.valid) { setLog(selectedProject.error || "invalid project manifest"); return; }
    setGenBusy(true);
    setGenResult(null);
    setLog("");
    try {
      setGenResult(await window.studio.generate({
        id: genId,
        prompt,
        game: selectedProject?.slug || game,
        projectId: selectedProject?.id,
        kind: category,
        provider,
        category,
        bitrate,
        normalize,
        loop,
        volume,
        license,
      }));
    } catch (e) {
      setLog(String((e as Error)?.message ?? e));
    } finally {
      setGenBusy(false);
    }
  }

  const providerOptions = AUDIO_PROVIDERS_BY_CATEGORY[category];

  return (
    <div className="gen">
      <div className="gen-form">
        <div className="gen-row">
          <button className={"set-btn" + (mode === "generate" ? " is-active" : "")} type="button" onClick={() => setMode("generate")}>Generate from prompt</button>
          <button className={"set-btn" + (mode === "transcode" ? " is-active" : "")} type="button" onClick={() => setMode("transcode")}>Transcode a file</button>
        </div>
        <label className="gen-field"><span>Game</span>
          <select value={selectedProject ? selectedProject.id : game} onChange={(e) => {
            if (projectState.projects.length) void changeProject(e.target.value);
            else setGame(e.target.value);
          }}>
            {projectState.projects.length
              ? projectState.projects.map((project) => <option key={project.id} value={project.id}>{project.name} · {project.slug}</option>)
              : games.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        {selectedProject?.manifestPath && <div className="gen-manifest">manifest {selectedProject.manifestPath}</div>}
        {selectedProject && !selectedProject.valid && <div className="project-error">{selectedProject.error}</div>}
        <label className="gen-field"><span>Category → src/assets/audio/&lt;category&gt;/</span>
          <select value={category} onChange={(e) => changeCategory(e.target.value as "sfx" | "music" | "voice")}>
            <option value="sfx">sfx</option>
            <option value="music">music</option>
            <option value="voice">voice</option>
          </select>
        </label>
        <label className="gen-field"><span>Opus bitrate (kbps)</span>
          <input type="number" min={32} max={320} value={bitrate} onChange={(e) => setBitrate(Number(e.target.value) || 128)} />
        </label>
        <label className="gen-field"><span><input type="checkbox" checked={normalize} onChange={(e) => setNormalize(e.target.checked)} /> loudnorm (recommended for SFX)</span></label>

        {mode === "generate" ? (
          <>
            <label className="gen-field"><span>Asset ID</span>
              <input value={genId} onChange={(e) => setGenId(e.target.value)} placeholder="impact-hit" />
            </label>
            <label className="gen-field gen-grow"><span>Prompt</span>
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} />
            </label>
            <label className="gen-field"><span>Provider</span>
              <select value={provider} onChange={(e) => setProvider(e.target.value)}>
                {providerOptions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </label>
            <div className="gen-row">
              <label className="gen-field"><span><input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> loop</span></label>
              <label className="gen-field"><span>Volume (0–1)</span>
                <input type="number" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Math.max(0, Math.min(1, Number(e.target.value) || 0)))} />
              </label>
            </div>
            <label className="gen-field"><span>License record</span>
              <input value={license} onChange={(e) => setLicense(e.target.value)} />
            </label>
            <button className="gen-btn" type="button" disabled={genBusy || !genId || !prompt || !!(selectedProject && !selectedProject.valid)} onClick={generate}>
              {genBusy ? "Generating…" : "Generate"}
            </button>
            <p className="gen-note">Generates a {category} clip → encodes to WebM/Opus → registers it in assets.json with category/volume/loop + a license record. Music loops via Soundraw / Beatoven, SFX via ElevenLabs / OptimizerAI (avoid Udio for shipped in-game loops).</p>
          </>
        ) : (
          <>
            <button className="set-btn" type="button" onClick={pick}>
              {files.length ? `${files.length} file(s) selected — change` : "Pick source audio…"}
            </button>
            {files.length > 0 && <p className="gen-note">{files.map((f) => f.split("/").pop()).join(", ")}</p>}
            <button className="gen-btn" type="button" disabled={busy || !files.length || !!(selectedProject && !selectedProject.valid)} onClick={transcode}>
              {busy ? "Transcoding…" : "Transcode → WebM/Opus"}
            </button>
            <p className="gen-note">ffmpeg → opus into the game's audio folder · strips cover art · registers each output in assets.json with a license record.</p>
          </>
        )}
      </div>
      <div className="gen-preview">
        {mode === "generate" ? (
          <>
            {genResult?.dataUrl
              ? <audio controls src={genResult.dataUrl} aria-label={`${genId} preview`}><track kind="captions" /></audio>
              : <div className="gen-preview-empty">{genBusy ? "generating…" : "preview"}</div>}
            {(log || genResult) && <pre className={"gen-log" + (genResult && !genResult.ok ? " is-err" : "")}>{log || "—"}</pre>}
            {genResult?.path && <div className="gen-path">{genResult.path}</div>}
          </>
        ) : (
          <>
            {result?.outputs?.length
              ? <pre className="gen-rules">{result.outputs.map((o) => o.split("/").slice(-2).join("/")).join("\n")}</pre>
              : <div className="gen-preview-empty">{busy ? "transcoding…" : "outputs"}</div>}
            {(log || result) && <pre className={"gen-log" + (result && !result.ok ? " is-err" : "")}>{log || "—"}</pre>}
          </>
        )}
      </div>
    </div>
  );
}

function TerminalPane() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sessionRef = useRef<string | null>(null);
  const [status, setStatus] = useState("starting");

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: '"JetBrains Mono", "SFMono-Regular", "Menlo", "Consolas", ui-monospace, monospace',
      fontSize: 12,
      lineHeight: 1.15,
      scrollback: 5000,
      theme: {
        background: "#07070b",
        foreground: "#e9e3d6",
        cursor: "#c1121f",
        selectionBackground: "#34343c",
        black: "#0a0a0a",
        red: "#c1121f",
        green: "#a8a05a",
        yellow: "#ff6a00",
        blue: "#7c7f89",
        magenta: "#a34747",
        cyan: "#9b958a",
        white: "#e9e3d6",
        brightBlack: "#46464f",
        brightRed: "#ff3b3b",
        brightGreen: "#d1c26c",
        brightYellow: "#ff8f1f",
        brightBlue: "#aeb1bd",
        brightMagenta: "#d26767",
        brightCyan: "#c4baad",
        brightWhite: "#fff7e8",
      },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(mount);
    terminalRef.current = terminal;
    fitRef.current = fit;

    let resizeFrame: number | null = null;
    const fitTerminal = () => {
      try {
        fit.fit();
      } catch {}
      const id = sessionRef.current;
      if (id) {
        void window.studio?.terminal.resize(id, { cols: terminal.cols, rows: terminal.rows });
      }
    };
    const resize = () => {
      if (resizeFrame !== null) return;
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = null;
        fitTerminal();
      });
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    window.addEventListener("resize", resize);

    const input = terminal.onData((data) => {
      const id = sessionRef.current;
      if (id) void window.studio?.terminal.write(id, data);
    });
    const offData = window.studio?.terminal.onData(({ id, data }) => {
      if (id === sessionRef.current) terminal.write(data);
    });
    const offExit = window.studio?.terminal.onExit(({ id, exitCode, signal }) => {
      if (id !== sessionRef.current) return;
      setStatus(`exited ${exitCode ?? signal ?? ""}`.trim());
      terminal.writeln(`\r\n[terminal exited ${exitCode ?? signal ?? "unknown"}]`);
      sessionRef.current = null;
    });

    async function start() {
      if (!window.studio?.terminal) {
        setStatus("bridge unavailable");
        terminal.writeln("studio terminal bridge unavailable");
        return;
      }

      resize();
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      fitTerminal();
      const started = await window.studio.terminal.start({ cols: terminal.cols, rows: terminal.rows });
      if (!started.ok) {
        setStatus("node-pty unavailable");
        terminal.writeln(started.error);
        return;
      }

      sessionRef.current = started.id;
      setStatus(`pid ${started.pid ?? "unknown"}`);
    }

    void start();

    return () => {
      const id = sessionRef.current;
      sessionRef.current = null;
      if (id) void window.studio?.terminal.stop(id);
      input.dispose();
      offData?.();
      offExit?.();
      resizeObserver.disconnect();
      window.removeEventListener("resize", resize);
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
  }, []);

  return (
    <section className="terminal" aria-label="Terminal">
      <div className="terminal-bar">
        <span className="terminal-dot" />
        <span className="terminal-title">terminal</span>
        <span className="terminal-hint">{status}</span>
      </div>
      <div className="terminal-body">
        <div ref={mountRef} className="terminal-mount" />
      </div>
    </section>
  );
}

const emptyMoodboard = (game: string): Moodboard => ({ game, items: [], updatedAt: "" });

function MoodboardPane() {
  const [game, setGame] = useState("scourge-survivors");
  const [games, setGames] = useState<string[]>(["scourge-survivors", "deadlane", "pactfall", "starblight"]);
  const [board, setBoard] = useState<Moodboard>(() => emptyMoodboard("scourge-survivors"));
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const drag = useRef<{
    id: string;
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    nextX: number;
    nextY: number;
  } | null>(null);

  useEffect(() => {
    window.studio?.settings.get().then((s) => s.defaultGame && setGame(s.defaultGame)).catch(() => {});
    window.studio?.moodboard.listGames().then((list) => list?.length && setGames(list)).catch(() => {});
  }, []);

  useEffect(() => {
    let live = true;
    setError("");
    window.studio?.moodboard.get(game)
      .then((next) => { if (live) setBoard(next); })
      .catch((e) => { if (live) setError(String((e as Error)?.message ?? e)); });
    return () => { live = false; };
  }, [game]);

  async function addNote() {
    if (!note.trim()) return;
    if (!window.studio?.moodboard) { setError("studio bridge unavailable"); return; }
    try {
      setBoard(await window.studio.moodboard.addNote(game, note));
      setNote("");
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    }
  }

  async function importImages() {
    if (!window.studio?.moodboard) { setError("studio bridge unavailable"); return; }
    try {
      setBoard(await window.studio.moodboard.importImages(game));
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    }
  }

  async function toggleTarget(item: MoodboardItem) {
    if (!window.studio?.moodboard) return;
    setBoard(await window.studio.moodboard.setVisualTarget(game, item.id, !item.visualTarget));
  }

  async function removeItem(item: MoodboardItem) {
    if (!window.studio?.moodboard) return;
    setBoard(await window.studio.moodboard.removeItem(game, item.id));
  }

  function startDrag(e: PointerEvent<HTMLElement>, item: MoodboardItem) {
    if ((e.target as HTMLElement).closest("button, textarea")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      id: item.id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: item.x,
      originY: item.y,
      nextX: item.x,
      nextY: item.y,
    };
  }

  function moveDrag(e: PointerEvent<HTMLElement>) {
    const activeDrag = drag.current;
    if (!activeDrag || activeDrag.pointerId !== e.pointerId) return;
    const nextX = Math.max(0, Math.round(activeDrag.originX + e.clientX - activeDrag.startX));
    const nextY = Math.max(0, Math.round(activeDrag.originY + e.clientY - activeDrag.startY));
    activeDrag.nextX = nextX;
    activeDrag.nextY = nextY;
    setBoard((current) => ({
      ...current,
      items: current.items.map((item) => item.id === activeDrag.id ? { ...item, x: nextX, y: nextY } : item),
    }));
  }

  async function endDrag(e: PointerEvent<HTMLElement>) {
    const activeDrag = drag.current;
    if (!activeDrag || activeDrag.pointerId !== e.pointerId) return;
    drag.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    if (!window.studio?.moodboard) return;
    setBoard(await window.studio.moodboard.updateItem(game, { id: activeDrag.id, x: activeDrag.nextX, y: activeDrag.nextY }));
  }

  async function updateNote(item: MoodboardItem, text: string) {
    if (!window.studio?.moodboard || text.trim() === (item.text || "").trim()) return;
    setBoard(await window.studio.moodboard.updateItem(game, { id: item.id, text }));
  }

  return (
    <div className="moodboard">
      <aside className="moodboard-tools">
        <label className="gen-field"><span>Game</span>
          <select value={game} onChange={(e) => setGame(e.target.value)}>
            {games.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        <label className="gen-field"><span>Note</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} placeholder="silhouette, palette, pose, read" />
        </label>
        <div className="moodboard-actions">
          <button className="set-btn" type="button" onClick={addNote} disabled={!note.trim()}>Add note</button>
          <button className="set-btn" type="button" onClick={importImages}>Import images</button>
        </div>
        <div className="moodboard-stats">
          <span>{board.items.length} items</span>
          <span>{board.items.filter((item) => item.visualTarget).length} targets</span>
        </div>
        {error && <pre className="gen-log is-err">{error}</pre>}
      </aside>

      <section className="moodboard-stage" aria-label={`${game} moodboard`}>
        <div className="moodboard-canvas">
          {board.items.length === 0 && (
            <div className="moodboard-empty">
              <span>empty board</span>
              <b>{game}</b>
            </div>
          )}
          {board.items.map((item) => (
            <article
              key={item.id}
              className={"moodboard-item" + (item.visualTarget ? " is-target" : "")}
              style={{ width: item.width, height: item.height, transform: `translate(${item.x}px, ${item.y}px)` }}
              onPointerDown={(e) => startDrag(e, item)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <header className="moodboard-item-head">
                <span>{item.type === "image" ? item.image?.name || "reference" : "note"}</span>
                <button type="button" title="Visual target" aria-label="Visual target" className="target-btn" onClick={() => toggleTarget(item)}>
                  {item.visualTarget ? "★" : "☆"}
                </button>
                <button type="button" title="Remove" aria-label="Remove" className="target-btn" onClick={() => removeItem(item)}>×</button>
              </header>
              {item.type === "image" ? (
                item.dataUrl ? <img src={item.dataUrl} alt={item.image?.name || "reference"} /> : <div className="moodboard-missing">missing image</div>
              ) : (
                <textarea aria-label="Note text" defaultValue={item.text || ""} onBlur={(e) => updateNote(item, e.target.value)} />
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

// The Lab re-runs generate() with an image kind, so it can only offer the kinds
// assetgen actually renders as images (IMAGE_KINDS / FAL_IMAGE_KINDS). Picking a
// non-image kind made generation throw "<provider> does not support <kind>". The
// live list comes from the catalog over studio:models (falImageKinds, the same
// source SettingsPane reads); this is the fallback when the catalog isn't loaded.
const LAB_KINDS = ["sprite", "sprite-anim", "texture", "icon", "map"];
// Image-capable providers only: the shared PROVIDERS list carries audio-only
// "suno", which always errors for an image kind. Mirrors MODEL_PROVIDERS /
// AUDIO_PROVIDERS_BY_CATEGORY — a small local table of the providers this pane
// can route to (every PROVIDERS entry except the audio-only ones).
const AUDIO_ONLY_PROVIDERS = new Set(["suno"]);
const LAB_PROVIDERS = PROVIDERS.filter((p) => !AUDIO_ONLY_PROVIDERS.has(p.id));
const emptyLab = (game: string): ArtLab => ({ game, subject: "", kind: "sprite", variants: [], lock: null, createdAt: "", updatedAt: "" });

function labSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "lab";
}

// Uncontrolled variant metadata fields. The parent keys them by the saved value,
// so unrelated re-renders cannot wipe an in-progress edit, while committed
// server-side normalization still remounts the input with the latest value.
function LabTagsField({ value, onCommit }: { value: string; onCommit: (next: string) => void }) {
  return (
    <input
      className="lab-tags"
      aria-label="Variant tags"
      defaultValue={value}
      placeholder="tags, comma, separated"
      onBlur={(event) => {
        const next = event.currentTarget.value;
        if (next.trim() !== value.trim()) onCommit(next);
        else event.currentTarget.value = value;
      }}
    />
  );
}

function LabNoteField({ value, onCommit }: { value: string; onCommit: (next: string) => void }) {
  return (
    <textarea
      className="lab-note"
      aria-label="Variant note"
      defaultValue={value}
      rows={2}
      placeholder="critique / note"
      onBlur={(event) => {
        const next = event.currentTarget.value;
        if (next.trim() !== value.trim()) onCommit(next);
        else event.currentTarget.value = value;
      }}
    />
  );
}

// Art Direction Lab (#82): one subject, many style-direction variants. Each
// variant is a real generate() run (subject + direction prompt) filed under the
// game's lab; the chosen one locks into a pipeline-readable style-target contract.
function LabPane() {
  const [game, setGame] = useState("scourge-survivors");
  const [games, setGames] = useState<string[]>(["scourge-survivors", "deadlane", "pactfall", "starblight"]);
  const [lab, setLab] = useState<ArtLab>(() => emptyLab("scourge-survivors"));
  const [subject, setSubject] = useState("");
  const [kind, setKind] = useState("sprite");
  const [provider, setProvider] = useState("codex");
  const [direction, setDirection] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState("");
  const [error, setError] = useState("");
  // The image kinds assetgen can render, sourced from the catalog over
  // studio:models (the same falImageKinds SettingsPane reads). Falls back to the
  // static LAB_KINDS until the catalog loads so the picker is never empty.
  const [kinds, setKinds] = useState<string[]>(LAB_KINDS);
  // Latest allowed kinds for the lab-load effect to clamp against, without making
  // that effect depend on `kinds` (which would re-fetch the lab when the catalog
  // resolves). LAB_KINDS and the resolved catalog are both valid image-kind sets.
  const kindsRef = useRef(kinds);
  kindsRef.current = kinds;

  useEffect(() => {
    window.studio?.settings.get().then((s) => {
      if (s.defaultGame) setGame(s.defaultGame);
      const next = withSettingsDefaults(s);
      const fallback = next.providerDefaults.sprite || next.defaultProvider;
      // Never seed an audio-only provider into an image-only pane.
      setProvider(LAB_PROVIDERS.some((p) => p.id === fallback) ? fallback : LAB_PROVIDERS[0].id);
    }).catch(() => {});
    window.studio?.models?.list().then((m) => {
      const list = m?.falImageKinds?.length ? m.falImageKinds : LAB_KINDS;
      setKinds(list);
      // If a stale/non-image kind is selected, snap to the first real one.
      setKind((k) => (list.includes(k) ? k : list[0]));
    }).catch(() => {});
    window.studio?.lab.listGames().then((list) => list?.length && setGames(list)).catch(() => {});
    const off = window.studio?.onGenLog((chunk) => setLog((l) => (l + chunk).slice(-8000)));
    return () => { off?.(); };
  }, []);

  useEffect(() => {
    let live = true;
    setError("");
    window.studio?.lab.get(game)
      .then((next) => {
        if (!live) return;
        setLab(next);
        setSubject(next.subject);
        // A lab persisted before kinds were restricted may carry a non-image kind
        // (e.g. "scene"); clamp it to a real image kind so generation can't throw.
        const allowed = kindsRef.current;
        const stored = next.kind || "sprite";
        setKind(allowed.includes(stored) ? stored : allowed[0]);
      })
      .catch((e) => { if (live) setError(String((e as Error)?.message ?? e)); });
    return () => { live = false; };
  }, [game]);

  const subjectDirty = subject.trim() !== (lab.subject || "").trim() || kind !== (lab.kind || "sprite");

  async function saveSubject() {
    if (!window.studio?.lab) { setError("studio bridge unavailable"); return; }
    try { setLab(await window.studio.lab.setSubject(game, subject, kind)); }
    catch (e) { setError(String((e as Error)?.message ?? e)); }
  }

  async function generateVariant() {
    if (!window.studio?.generate || !window.studio.lab) { setLog("studio bridge unavailable — restart the app"); return; }
    const base = subject.trim();
    if (!base) { setError("set a subject first"); return; }
    setBusy(true);
    setError("");
    setLog("");
    try {
      // Persist subject/kind first so every variant matches what's on screen.
      if (subjectDirty) setLab(await window.studio.lab.setSubject(game, subject, kind));
      const prompt = [base, direction.trim()].filter(Boolean).join(" — ");
      const genId = `lab-${labSlug(base)}-${Math.random().toString(36).slice(2, 7)}`;
      const result = await window.studio.generate({ id: genId, prompt, game, kind, provider });
      if (!result.ok || !result.dataUrl) {
        setError(result.ok ? "generation produced no previewable image" : "generation failed — see log");
        return;
      }
      setLab(await window.studio.lab.addVariant(game, {
        direction: direction.trim(),
        prompt,
        provider,
        dataUrl: result.dataUrl,
        sourcePath: result.path,
        mime: result.mediaType || undefined,
      }));
      setDirection("");
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  // Every variant mutation funnels through here so a rejected IPC call surfaces an
  // error instead of silently no-op'ing — and a dead bridge says so out loud.
  async function runMutation(fn: (lab: NonNullable<typeof window.studio>["lab"]) => Promise<ArtLab>) {
    const api = window.studio?.lab;
    if (!api) { setError("studio bridge unavailable — restart the app"); return; }
    try { setError(""); setLab(await fn(api)); }
    catch (e) { setError(String((e as Error)?.message ?? e)); }
  }

  function scoreVariant(variant: ArtLabVariant, value: number) {
    return runMutation((api) => api.scoreVariant(game, variant.id, value === variant.score ? 0 : value));
  }
  function retagVariant(variant: ArtLabVariant, value: string) {
    const tags = value.split(",").flatMap((tag) => {
      const trimmed = tag.trim();
      return trimmed ? [trimmed] : [];
    });
    return runMutation((api) => api.tagVariant(game, variant.id, tags));
  }
  function annotateVariant(variant: ArtLabVariant, value: string) {
    if (value.trim() === (variant.note || "").trim()) return;
    return runMutation((api) => api.annotateVariant(game, variant.id, value));
  }
  function removeVariant(variant: ArtLabVariant) {
    return runMutation((api) => api.removeVariant(game, variant.id));
  }
  function toggleLock(variant: ArtLabVariant) {
    return runMutation((api) => (variant.locked ? api.clearLock(game) : api.lockVariant(game, variant.id)));
  }
  function clearLock() {
    return runMutation((api) => api.clearLock(game));
  }

  return (
    <div className="lab">
      <aside className="lab-tools">
        <label className="gen-field"><span>Game</span>
          <select value={game} onChange={(e) => setGame(e.target.value)}>
            {games.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        <label className="gen-field"><span>Subject</span>
          <textarea value={subject} onChange={(e) => setSubject(e.target.value)} rows={3} placeholder="the base art concept — e.g. a rotting Scourge husk mid-lunge" />
        </label>
        <div className="gen-row">
          <label className="gen-field"><span>Kind</span>
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
          <label className="gen-field"><span>Provider</span>
            <select value={provider} onChange={(e) => setProvider(e.target.value)}>
              {LAB_PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
            </select>
          </label>
        </div>
        <button className="set-btn" type="button" onClick={saveSubject} disabled={!subjectDirty || !subject.trim()}>
          {subjectDirty ? "Save subject" : "Subject saved"}
        </button>
        <label className="gen-field"><span>Style direction</span>
          <textarea value={direction} onChange={(e) => setDirection(e.target.value)} rows={3} placeholder="this variant's look — e.g. high-contrast rim light, desaturated, wet gore" />
        </label>
        <button className="gen-btn" type="button" onClick={generateVariant} disabled={busy || !subject.trim()}>
          {busy ? "Forging variant…" : "Generate variant"}
        </button>
        <p className="gen-note">Re-prompts the subject with this style direction via the <b>{provider}</b> pipeline, then files the result under {game}'s lab. Locking writes a style-target contract the pipeline can read later (#56).</p>
        <div className="lab-stats">
          <span>{lab.variants.length} variants</span>
          <span>{lab.lock ? "1 locked" : "no lock"}</span>
        </div>
        {error && <pre className="gen-log is-err">{error}</pre>}
        {(busy || log) && <pre className="gen-log">{log || "—"}</pre>}
      </aside>

      <section className="lab-stage" aria-label={`${game} art lab`}>
        {lab.lock && (
          <div className="lab-lock">
            <div className="lab-lock-thumb">
              {lab.lock.dataUrl ? <img src={lab.lock.dataUrl} alt="locked style target" /> : <div className="lab-missing">no image</div>}
            </div>
            <div className="lab-lock-body">
              <span className="lab-lock-tag">★ locked style target</span>
              <strong>{lab.lock.direction || "(no direction)"}</strong>
              <code className="lab-lock-prompt">{lab.lock.prompt}</code>
            </div>
            <button className="set-btn" type="button" onClick={clearLock}>Clear lock</button>
          </div>
        )}

        {lab.variants.length === 0 ? (
          <div className="lab-empty">
            <span>no variants yet</span>
            <b>{game}</b>
          </div>
        ) : (
          <div className="lab-grid">
            {lab.variants.map((variant) => (
              <article key={variant.id} className={"lab-card" + (variant.locked ? " is-locked" : "")}>
                <div className="lab-card-img">
                  {variant.dataUrl ? <img src={variant.dataUrl} alt={variant.direction || "variant"} /> : <div className="lab-missing">missing image</div>}
                </div>
                <div className="lab-card-body">
                  <div className="lab-direction">{variant.direction || <em>no direction</em>}</div>
                  <div className="lab-score" role="group" aria-label="Score">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button" className={"lab-star" + (n <= variant.score ? " is-on" : "")} aria-label={`Score ${n}`} onClick={() => scoreVariant(variant, n)}>★</button>
                    ))}
                  </div>
                  <LabTagsField
                    key={`${variant.id}:tags:${variant.tags.join(",")}`}
                    value={variant.tags.join(", ")}
                    onCommit={(next) => retagVariant(variant, next)}
                  />
                  <LabNoteField
                    key={`${variant.id}:note:${variant.note}`}
                    value={variant.note}
                    onCommit={(next) => annotateVariant(variant, next)}
                  />
                  <div className="lab-card-actions">
                    <button type="button" className="set-btn" onClick={() => toggleLock(variant)}>{variant.locked ? "Unlock" : "Lock as target"}</button>
                    <button type="button" className="target-btn" aria-label="Remove variant" title="Remove" onClick={() => removeVariant(variant)}>×</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function formatBytes(bytes: number | null): string {
  if (!bytes && bytes !== 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const GALLERY_EMPTY: GalleryResult = { ok: false, root: null, game: "", games: [], assets: [] };

// Asset gallery — read-only review + compare surface over the shared Deadrot assets
// package. Loads thumbnails inline (with a lazy fallback for deferred ones), groups
// by folder, filters by category/search, and offers a pin-to-compare tray + lightbox.
function GalleryPane() {
  const [game, setGame] = useState("scourge-survivors");
  const [result, setResult] = useState<GalleryResult>(GALLERY_EMPTY);
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [compare, setCompare] = useState<string[]>([]);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const load = useCallback(async (target: string) => {
    if (!window.studio?.gallery) {
      setResult({ ...GALLERY_EMPTY, error: "studio bridge unavailable — restart the app" });
      return;
    }
    setBusy(true);
    setExtra({});
    setCompare([]);
    setLightbox(null);
    try {
      setResult(await window.studio.gallery.list(target));
    } catch (e) {
      setResult({ ...GALLERY_EMPTY, game: target, error: String((e as Error)?.message ?? e) });
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    window.studio?.settings.get().then((s) => {
      const target = s.defaultGame || "scourge-survivors";
      setGame(target);
      void load(target);
    }).catch(() => { void load("scourge-survivors"); });
  }, [load]);

  // Lazily pull thumbnails the main process deferred past its inline byte budget.
  useEffect(() => {
    const deferred = result.assets.filter((a) => a.deferred && !a.dataUrl && !extra[a.path]);
    if (!deferred.length || !window.studio?.gallery) return;
    let cancelled = false;
    (async () => {
      const queue = [...deferred];
      const workers = Array.from({ length: Math.min(6, queue.length) }, async () => {
        while (queue.length && !cancelled) {
          const next = queue.shift();
          if (!next) break;
          try {
            const img = await window.studio?.gallery.image(next.path);
            if (img?.dataUrl && !cancelled) setExtra((prev) => ({ ...prev, [next.path]: img.dataUrl }));
          } catch {}
        }
      });
      await Promise.all(workers);
    })();
    return () => { cancelled = true; };
  }, [result, extra]);

  const srcFor = useCallback((asset: GalleryAsset): string | null => asset.dataUrl ?? extra[asset.path] ?? null, [extra]);

  const categories = useMemo(() => {
    const set = new Map<string, number>();
    for (const a of result.assets) set.set(a.category, (set.get(a.category) || 0) + 1);
    return [...set.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [result.assets]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return result.assets.filter((a) => {
      if (category !== "all" && a.category !== category) return false;
      if (!q) return true;
      return a.id.toLowerCase().includes(q) || a.group.toLowerCase().includes(q) || a.path.toLowerCase().includes(q);
    });
  }, [result.assets, category, query]);

  const groups = useMemo(() => {
    const map = new Map<string, GalleryAsset[]>();
    for (const a of filtered) {
      const list = map.get(a.group) || [];
      list.push(a);
      map.set(a.group, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const byId = useMemo(() => new Map(result.assets.map((a) => [a.id, a])), [result.assets]);
  const compareAssets = compare.flatMap((id) => { const asset = byId.get(id); return asset ? [asset] : []; });
  const lightboxAsset = lightbox ? byId.get(lightbox) || null : null;
  const lightboxIndex = lightboxAsset ? filtered.findIndex((a) => a.id === lightboxAsset.id) : -1;

  const togglePin = useCallback((id: string) => {
    setCompare((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 4 ? prev : [...prev, id]));
  }, []);

  const copyText = useCallback((value: string) => {
    void navigator.clipboard?.writeText(value).catch(() => {});
  }, []);

  const step = useCallback((delta: number) => {
    setLightbox((current) => {
      if (!current) return current;
      const idx = filtered.findIndex((a) => a.id === current);
      if (idx < 0) return current;
      const next = filtered[(idx + delta + filtered.length) % filtered.length];
      return next ? next.id : current;
    });
  }, [filtered]);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, step]);

  const games = result.games.length ? result.games : [game];

  return (
    <div className="gallery">
      <div className="gallery-toolbar">
        <label className="gen-field gallery-game"><span>Game</span>
          <select value={game} onChange={(e) => { setGame(e.target.value); void load(e.target.value); }}>
            {games.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        <input
          className="gallery-search"
          aria-label="Search assets"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search id, folder, path…"
        />
        <button className="set-btn" type="button" disabled={busy} onClick={() => void load(game)}>{busy ? "Loading…" : "Reload"}</button>
      </div>

      <div className="gallery-filter">
        <button type="button" className={"gallery-chip" + (category === "all" ? " is-active" : "")} onClick={() => setCategory("all")}>
          all <b>{result.assets.length}</b>
        </button>
        {categories.map(([cat, count]) => (
          <button key={cat} type="button" className={"gallery-chip" + (category === cat ? " is-active" : "")} onClick={() => setCategory(cat)}>
            {cat} <b>{count}</b>
          </button>
        ))}
        <span className="gallery-meta">
          {result.source ? `${result.source}` : ""}
          {result.assetBaseUrl ? " · cdn" : ""}
          {result.assets.some((a) => a.missing) ? ` · ${result.assets.filter((a) => a.missing).length} missing` : ""}
        </span>
      </div>

      {compareAssets.length > 0 && (
        <div className="gallery-compare">
          <div className="gallery-compare-head">
            <span>Compare · {compareAssets.length}/4</span>
            <button className="set-btn" type="button" onClick={() => setCompare([])}>Clear</button>
          </div>
          <div className="gallery-compare-row">
            {compareAssets.map((a) => (
              <figure key={a.id} className="gallery-compare-item">
                <button type="button" className="gallery-compare-remove" aria-label="Remove" onClick={() => togglePin(a.id)}>×</button>
                {srcFor(a) ? <img src={srcFor(a) ?? undefined} alt={a.id} /> : <div className="gallery-missing">{a.missing ? "missing" : "…"}</div>}
                <figcaption>{a.id}{a.dimensions ? ` · ${a.dimensions[0]}×${a.dimensions[1]}` : ""}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}

      {result.error && <pre className="gen-log is-err">{result.error}</pre>}

      <div className="gallery-scroll">
        {filtered.length === 0 && !busy && (
          <div className="gallery-empty">{result.error ? "no assets" : "no matches"}</div>
        )}
        {groups.map(([groupName, assets]) => (
          <section className="gallery-group" key={groupName}>
            <header className="gallery-group-head">{groupName} <span>{assets.length}</span></header>
            <div className="gallery-grid">
              {assets.map((a) => {
                const src = srcFor(a);
                const pinned = compare.includes(a.id);
                return (
                  <article className={"gallery-card" + (pinned ? " is-pinned" : "")} key={a.id}>
                    <button type="button" className="gallery-thumb" onClick={() => setLightbox(a.id)} title={a.path}>
                      {a.missing ? (
                        <div className="gallery-missing">missing</div>
                      ) : src ? (
                        <img src={src} alt={a.id} style={a.filter === "nearest" ? { imageRendering: "pixelated" } : undefined} />
                      ) : (
                        <div className="gallery-missing">…</div>
                      )}
                      {a.view && <span className="gallery-tag">{a.view}</span>}
                    </button>
                    <div className="gallery-card-meta">
                      <span className="gallery-card-id" title={a.id}>{a.id}</span>
                      <span className="gallery-card-sub">
                        {a.dimensions ? `${a.dimensions[0]}×${a.dimensions[1]}` : a.type} · {formatBytes(a.bytes)}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={"gallery-pin" + (pinned ? " is-pinned" : "")}
                      onClick={() => togglePin(a.id)}
                      aria-label={pinned ? "Unpin from compare" : "Pin to compare"}
                      title={pinned ? "Unpin" : "Pin to compare"}
                    >
                      {pinned ? "✓" : "⊕"}
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {lightboxAsset && (
        <div
          className="modal-backdrop"
          role="button"
          tabIndex={0}
          aria-label="Close"
          onClick={() => setLightbox(null)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setLightbox(null); }}
        >
          <div className="gallery-lightbox" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <span className="modal-title">{lightboxAsset.id}</span>
              <div className="gallery-lightbox-nav">
                <button className="modal-close" type="button" aria-label="Previous" onClick={() => step(-1)}>‹</button>
                <span className="gallery-lightbox-count">{lightboxIndex + 1} / {filtered.length}</span>
                <button className="modal-close" type="button" aria-label="Next" onClick={() => step(1)}>›</button>
                <button className="modal-close" type="button" aria-label="Close" onClick={() => setLightbox(null)}>×</button>
              </div>
            </div>
            <div className="gallery-lightbox-body">
              <div className="gallery-lightbox-stage">
                {srcFor(lightboxAsset) ? (
                  <img src={srcFor(lightboxAsset) ?? undefined} alt={lightboxAsset.id} style={lightboxAsset.filter === "nearest" ? { imageRendering: "pixelated" } : undefined} />
                ) : (
                  <div className="gallery-missing">{lightboxAsset.missing ? "missing on disk" : "loading…"}</div>
                )}
              </div>
              <dl className="gallery-lightbox-meta">
                <dt>category</dt><dd>{lightboxAsset.category}{lightboxAsset.view ? ` · ${lightboxAsset.view}` : ""}</dd>
                <dt>type</dt><dd>{lightboxAsset.type}</dd>
                {lightboxAsset.dimensions && (<><dt>dimensions</dt><dd>{lightboxAsset.dimensions[0]}×{lightboxAsset.dimensions[1]}</dd></>)}
                {lightboxAsset.scale && (<><dt>scale</dt><dd>{lightboxAsset.scale[0]} × {lightboxAsset.scale[1]}</dd></>)}
                {lightboxAsset.filter && (<><dt>filter</dt><dd>{lightboxAsset.filter}</dd></>)}
                {lightboxAsset.role && (<><dt>role</dt><dd>{lightboxAsset.role}</dd></>)}
                <dt>size</dt><dd>{formatBytes(lightboxAsset.bytes)}</dd>
                <dt>path</dt><dd className="gallery-lightbox-path">{lightboxAsset.path}</dd>
                {lightboxAsset.cdnUrl && (
                  <><dt>cdn</dt><dd className="gallery-lightbox-path">{lightboxAsset.cdnUrl}</dd></>
                )}
                {lightboxAsset.license && (
                  <><dt>license</dt><dd>{Object.entries(lightboxAsset.license).map(([k, v]) => `${k}: ${String(v)}`).join("\n")}</dd></>
                )}
              </dl>
            </div>
            <div className="gallery-lightbox-foot">
              <button
                className="set-btn"
                type="button"
                onClick={() => togglePin(lightboxAsset.id)}
              >
                {compare.includes(lightboxAsset.id) ? "Unpin from compare" : "Pin to compare"}
              </button>
              {lightboxAsset.cdnUrl && (
                <>
                  <button className="set-btn" type="button" onClick={() => copyText(lightboxAsset.cdnUrl!)}>
                    Copy CDN URL
                  </button>
                  <a className="set-btn gallery-link-btn" href={lightboxAsset.cdnUrl} target="_blank" rel="noreferrer">
                    Open CDN
                  </a>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MapsPane() {
  const [id, setId] = useState("breach-alpha");
  const [name, setName] = useState("");
  const [game, setGame] = useState("scourge-survivors");
  const [games, setGames] = useState<string[]>(["scourge-survivors"]);
  const [seed, setSeed] = useState(1);
  const [rooms, setRooms] = useState(6);
  const [levels, setLevels] = useState(2);
  const [half, setHalf] = useState(24);
  const [coverPerRoom, setCoverPerRoom] = useState(3);
  const [spawnRadius, setSpawnRadius] = useState(2.5);
  const [preview, setPreview] = useState<MapPreviewResult | null>(null);
  const [written, setWritten] = useState<MapWriteResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const options: MapsGenOptions = useMemo(
    () => ({ id, name: name.trim() || undefined, game, seed, rooms, levels, half, coverPerRoom, spawnRadius }),
    [id, name, game, seed, rooms, levels, half, coverPerRoom, spawnRadius],
  );

  useEffect(() => {
    window.studio?.settings.get().then((s) => s.defaultGame && setGame(s.defaultGame)).catch(() => {});
    window.studio?.maps.listGames().then((list) => list?.length && setGames(list)).catch(() => {});
  }, []);

  // Live preview — the generator is pure + in-process, so it is cheap to re-seed
  // on every input change. Failures surface in the validation panel, not a throw.
  useEffect(() => {
    if (!window.studio?.maps || !id.trim()) { setPreview(null); return; }
    let live = true;
    setError("");
    window.studio.maps.preview(options)
      .then((next) => { if (live) { setPreview(next); setWritten(null); } })
      .catch((e) => { if (live) setError(String((e as Error)?.message ?? e)); });
    return () => { live = false; };
  }, [options, id]);

  async function write() {
    if (!window.studio?.maps) { setError("studio bridge unavailable — restart the app"); return; }
    if (!id.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await window.studio.maps.write(options);
      setWritten(result);
      if (!result.ok) setError("layout failed validation — fix the issues above before writing");
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  const summary = preview?.summary;
  const issues = preview && !preview.ok ? preview.validation.issues : [];

  return (
    <div className="gen">
      <div className="gen-form">
        <label className="gen-field"><span>Map ID</span>
          <input value={id} onChange={(e) => setId(e.target.value)} placeholder="breach-alpha" />
        </label>
        <label className="gen-field"><span>Display name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="(defaults to “<id> breach arena”)" />
        </label>
        <label className="gen-field"><span>Game</span>
          <select value={game} onChange={(e) => setGame(e.target.value)}>
            {games.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        <div className="gen-row">
          <label className="gen-field"><span>Seed</span>
            <input type="number" min={0} value={seed} onChange={(e) => setSeed(Math.max(0, Math.floor(Number(e.target.value) || 0)))} />
          </label>
          <label className="gen-field"><span>Rooms</span>
            <input type="number" min={1} max={64} value={rooms} onChange={(e) => setRooms(Math.max(1, Math.min(64, Number(e.target.value) || 1)))} />
          </label>
        </div>
        <div className="gen-row">
          <label className="gen-field"><span>Levels</span>
            <input type="number" min={1} max={8} value={levels} onChange={(e) => setLevels(Math.max(1, Math.min(8, Number(e.target.value) || 1)))} />
          </label>
          <label className="gen-field"><span>Arena half-extent (m)</span>
            <input type="number" min={8} max={200} value={half} onChange={(e) => setHalf(Math.max(8, Math.min(200, Number(e.target.value) || 24)))} />
          </label>
        </div>
        <div className="gen-row">
          <label className="gen-field"><span>Cover / room</span>
            <input type="number" min={0} max={20} value={coverPerRoom} onChange={(e) => setCoverPerRoom(Math.max(0, Math.min(20, Number(e.target.value) || 0)))} />
          </label>
          <label className="gen-field"><span>Spawn radius (m)</span>
            <input type="number" min={0.5} max={20} step={0.5} value={spawnRadius} onChange={(e) => setSpawnRadius(Math.max(0.5, Math.min(20, Number(e.target.value) || 2.5)))} />
          </label>
        </div>
        <div className="gen-active">preset <b>breach-arena</b> · seeded engine ArenaMap · validated geometry</div>
        <button className="gen-btn" type="button" disabled={busy || !id.trim() || !!(preview && !preview.ok)} onClick={write}>
          {busy ? "Writing…" : "Write map module"}
        </button>
        <p className="gen-note">Writes a typed <code>{`${id || "<id>"}.maps.ts`}</code> (+ SVG) into the Studio maps folder — copy it into the target game’s <code>data/maps.ts</code>. Layout is deterministic per seed.</p>
      </div>
      <div className="gen-preview">
        {preview?.dataUrl ? (
          <img className="map-preview" src={preview.dataUrl} alt={`${id} top-down preview`} />
        ) : <div className="gen-preview-empty">preview</div>}
        {summary && (
          <div className="gen-active">
            {summary.rooms} rooms · {summary.levels} levels · {summary.obstacles} obstacles · {summary.lights} lights
          </div>
        )}
        {issues.length > 0 && (
          <pre className="gen-log is-err">{issues.map((i) => `[${i.code}] ${i.message}`).join("\n")}</pre>
        )}
        {error && <pre className="gen-log is-err">{error}</pre>}
        {written?.ok && written.path && <div className="gen-path">{written.path}</div>}
        {written?.ok && written.svgPath && <div className="gen-path">{written.svgPath}</div>}
      </div>
    </div>
  );
}

export default function App() {
  const [active, setActive] = useState<SectionId>("sprites");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const section = SECTIONS.find((s) => s.id === active) ?? SECTIONS[0];

  return (
    <div className="studio">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">☣</span>
          <div className="brand-text"><strong>SHIP SHIT</strong><span>STUDIO</span></div>
        </div>
        <nav className="nav">
          {GROUPS.map((group) => (
            <div className="nav-group" key={group}>
              <div className="nav-group-label">{group}</div>
              {SECTIONS.flatMap((s) => s.group === group ? [(
                <button key={s.id} type="button" className={"nav-item" + (s.id === active ? " is-active" : "")} onClick={() => setActive(s.id)}>
                  <span className="nav-glyph" aria-hidden="true">{s.glyph}</span>
                  {s.label}
                </button>
              )] : [])}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">generator hub · v0.1.0</div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <span className="topbar-label">{section.group} / {section.label}</span>
          <button className="topbar-gear" type="button" title="Settings" aria-label="Settings" onClick={() => setSettingsOpen(true)}>⚙</button>
        </header>

        <main className="pane">
          <header className="pane-head">
            <div className="pane-eyebrow">{section.group}</div>
            <h1 className="pane-title">{section.label}</h1>
            <p className="pane-blurb">{section.blurb}</p>
          </header>
          <div className="pane-body">
            {active === "projects" ? <ProjectsPane /> : active === "gyms" ? <GymsPane /> : active === "gallery" ? <GalleryPane /> : active === "maps" ? <MapsPane /> : active === "sprites" ? <SpritesPane /> : active === "music" ? <MusicPane /> : active === "3d" ? <ModelPane /> : active === "moodboard" ? <MoodboardPane /> : active === "lab" ? <LabPane /> : active === "resources" ? <ResourcesPane /> : (
              <div className="placeholder-card">
                <div className="placeholder-glyph" aria-hidden="true">{section.glyph}</div>
                <p><strong>{section.label}</strong> workspace coming online.</p>
                <p className="placeholder-sub">Same shape as Sprites — wiring lands in a later issue.</p>
              </div>
            )}
          </div>
        </main>

        <TerminalPane />
      </div>

      {settingsOpen && (
        <div
          className="modal-backdrop"
          role="button"
          tabIndex={0}
          aria-label="Close settings"
          onClick={() => setSettingsOpen(false)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSettingsOpen(false); }}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <span className="modal-title">Settings</span>
              <button className="modal-close" type="button" aria-label="Close" onClick={() => setSettingsOpen(false)}>×</button>
            </div>
            <div className="modal-body"><SettingsPane /></div>
          </div>
        </div>
      )}
    </div>
  );
}
