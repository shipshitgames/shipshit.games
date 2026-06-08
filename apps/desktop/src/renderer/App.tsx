import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import "@xterm/xterm/css/xterm.css";

// Studio cockpit. Sprites is wired to @shipshitgames/assetgen via the studio IPC bridge with a
// live streaming log. Provider + keys are configured once in Settings (topbar gear).
// Default provider = codex CLI (your subscription — no API key).

type SectionId = "projects" | "gallery" | "maps" | "sprites" | "music" | "3d" | "moodboard" | "research" | "codegen";
type Group = "Generators" | "Art Direction" | "Ressources" | "Codegen";
type Section = { id: SectionId; label: string; group: Group; glyph: string; blurb: string };

interface GenResult { ok: boolean; log: string; path: string | null; dataUrl: string | null; previewPath?: string | null }
interface ResearchResult { ok: boolean; log: string; path: string | null; rules: string | null }
interface ProjectAsset { id: string; kind: string; path: string; game: string | null }
interface ProjectSummary {
  id: string;
  name: string;
  slug: string;
  repoPath: string;
  source: "registered" | "discovered";
  manifestPath: string;
  isActive: boolean;
  exists: boolean;
  valid: boolean;
  error: string | null;
  assetCount: number;
  kindCounts: Record<string, number>;
  assets: ProjectAsset[];
  catalogTruncated: boolean;
}
interface ProjectState { projects: ProjectSummary[]; activeProjectId: string; activeManifestPath: string | null }
interface Settings {
  defaultProvider: string;
  defaultGame: string;
  providerDefaults: Record<string, string>;
  activeProjectId?: string;
  projects?: Array<{ id: string; name: string; slug: string; repoPath: string }>;
}
type TerminalStartResult =
  | { ok: true; id: string; pid: number | null; shell: string; cwd: string; cols: number; rows: number }
  | { ok: false; error: string };
interface TerminalPayload { id: string; data: string }
interface TerminalExitPayload { id: string; exitCode: number | null; signal: number | null }
interface MoodboardImage { name: string; path: string; mime: string }
interface MoodboardItem {
  id: string;
  type: "note" | "image";
  x: number;
  y: number;
  width: number;
  height: number;
  visualTarget: boolean;
  text?: string;
  image?: MoodboardImage;
  dataUrl?: string | null;
}
interface Moodboard { game: string; items: MoodboardItem[]; updatedAt: string }
interface GalleryAsset {
  id: string;
  assetId: string;
  category: string;
  type: string;
  view: string | null;
  path: string;
  group: string;
  dimensions: [number, number] | null;
  scale: [number, number] | null;
  filter: string | null;
  role: string | null;
  license: Record<string, unknown> | null;
  missing: boolean;
  dataUrl: string | null;
  bytes: number | null;
  deferred: boolean;
}
interface GalleryResult {
  ok: boolean;
  error?: string;
  root: string | null;
  source?: "manifest" | "filesystem";
  manifestPath?: string | null;
  game: string;
  games: string[];
  assets: GalleryAsset[];
  embeddedBytes?: number;
}

declare global {
  interface Window {
    studio?: {
      platform: string;
      versions: Record<string, string>;
      generate: (opts: {
        id: string;
        prompt: string;
        game: string;
        kind: string;
        provider?: string;
        projectId?: string;
        views?: string;
        frames?: number;
        fps?: number;
        anchor?: string;
        scale?: number;
        license?: string;
        licenseUrl?: string;
      }) => Promise<GenResult>;
      listGames: () => Promise<string[]>;
      onGenLog: (cb: (chunk: string) => void) => () => void;
      research: (opts: { url: string; slug: string; provider?: string }) => Promise<ResearchResult>;
      onResearchLog: (cb: (chunk: string) => void) => () => void;
      transcodeAudio: (opts: { files: string[]; game: string; category: string; bitrate?: number; normalize?: boolean; projectId?: string }) => Promise<{ ok: boolean; log: string; outputs: string[] }>;
      pickAudioFiles: () => Promise<string[]>;
      onTranscodeLog: (cb: (chunk: string) => void) => () => void;
      settings: { get: () => Promise<Settings>; set: (p: Partial<Settings>) => Promise<Settings> };
      projects: {
        list: () => Promise<ProjectState>;
        add: () => Promise<ProjectState>;
        remove: (id: string) => Promise<ProjectState>;
        setActive: (id: string) => Promise<ProjectState>;
      };
      keys: { status: () => Promise<Record<string, boolean>>; set: (provider: string, key: string) => Promise<Record<string, boolean>> };
      terminal: {
        start: (opts?: { cols?: number; rows?: number; cwd?: string }) => Promise<TerminalStartResult>;
        write: (id: string, data: string) => Promise<boolean>;
        resize: (id: string, size: { cols: number; rows: number }) => Promise<boolean>;
        stop: (id: string) => Promise<boolean>;
        onData: (cb: (payload: TerminalPayload) => void) => () => void;
        onExit: (cb: (payload: TerminalExitPayload) => void) => () => void;
      };
      gallery: {
        listGames: () => Promise<string[]>;
        list: (game: string, opts?: { embedBudget?: number }) => Promise<GalleryResult>;
        image: (assetPath: string) => Promise<{ dataUrl: string; bytes: number } | null>;
      };
      moodboard: {
        listGames: () => Promise<string[]>;
        get: (game: string) => Promise<Moodboard>;
        addNote: (game: string, text: string) => Promise<Moodboard>;
        importImages: (game: string) => Promise<Moodboard>;
        updateItem: (game: string, item: Partial<MoodboardItem> & { id: string }) => Promise<Moodboard>;
        setVisualTarget: (game: string, id: string, visualTarget: boolean) => Promise<Moodboard>;
        removeItem: (game: string, id: string) => Promise<Moodboard>;
      };
    };
  }
}

const SECTIONS: Section[] = [
  { id: "projects", label: "Projects", group: "Codegen", glyph: "⌂", blurb: "Local game repos, target manifests, and asset catalogs." },
  { id: "maps", label: "Maps", group: "Generators", glyph: "▞", blurb: "Breach-zone layouts and arena maps for the Scourge front." },
  { id: "sprites", label: "Sprites", group: "Generators", glyph: "✦", blurb: "Forge DOOM-grade billboards and enemy cutouts — straight into a game's assets." },
  { id: "music", label: "Music + SFX", group: "Generators", glyph: "♪", blurb: "Brutal scores and combat SFX for the shipshitshow." },
  { id: "3d", label: "3D", group: "Generators", glyph: "◈", blurb: "Meshes, props and Warden engineering for the 3D titles." },
  { id: "gallery", label: "Gallery", group: "Art Direction", glyph: "▤", blurb: "Review and compare every generated asset in a game's pack — sprites, tiers, textures, UI." },
  { id: "moodboard", label: "Moodboard", group: "Art Direction", glyph: "▦", blurb: "Per-game reference boards for notes, images, and locked visual targets." },
  { id: "research", label: "Rules", group: "Ressources", glyph: "📖", blurb: "Distill a YouTube game-dev tutorial into a reusable build ruleset." },
  { id: "codegen", label: "Codegen", group: "Codegen", glyph: "λ", blurb: "Plan → Review → Execute → Verify → Ship over the local CLI." },
];
const GROUPS: Group[] = ["Generators", "Art Direction", "Ressources", "Codegen"];

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
  { id: "suno", label: "Suno" },
];
const DEFAULT_PROVIDER_BY_KIND: Record<string, string> = {
  sprite: "codex",
  texture: "openai",
  icon: "openai",
  map: "codex",
  music: "suno",
  sfx: "suno",
  voice: "suno",
  model: "replicate",
  "3d": "replicate",
};
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
    providerDefaults: { ...DEFAULT_PROVIDER_BY_KIND, ...(settings.providerDefaults || {}) },
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
  const [settings, setSettings] = useState<Settings>(withSettingsDefaults({}));
  const [games, setGames] = useState<string[]>(["scourge-survivors"]);
  const [status, setStatus] = useState<Record<string, boolean>>({});
  const [inputs, setInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    window.studio?.settings.get().then((s) => setSettings(withSettingsDefaults(s))).catch(() => {});
    window.studio?.keys.status().then(setStatus).catch(() => {});
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
            <select value={settings.providerDefaults[item.kind] || settings.defaultProvider} onChange={(e) => updateKindProvider(item.kind, e.target.value)}>
              {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
        ))}
      </div>
      <div className="set-group">
        <div className="set-group-title">API keys — only for key-based providers</div>
        <p className="gen-note">Codex uses your ChatGPT/Codex subscription — no key needed. Key-based providers are stored in your macOS keychain.</p>
        {KEYED.map((k) => (
          <div className="set-key-row" key={k.id}>
            <span className="label">{k.label}</span>
            <input type="password" placeholder={status[k.id] ? "•••••••• stored" : "paste key"} value={inputs[k.id] || ""} onChange={(e) => setInputs((s) => ({ ...s, [k.id]: e.target.value }))} />
            <button className="set-btn" onClick={() => saveKey(k.id)}>Save</button>
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

function SpritesPane() {
  const [id, setId] = useState("swarm-husk");
  const [prompt, setPrompt] = useState("a rotting bio-husk of the Scourge, mid-lunge, gore");
  const [game, setGame] = useState("scourge-survivors");
  const [games, setGames] = useState<string[]>(["scourge-survivors"]);
  const [projectState, setProjectState] = useState<ProjectState>(EMPTY_PROJECT_STATE);
  const [projectId, setProjectId] = useState("");
  const [provider, setProvider] = useState("codex");
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
        <div className="gen-active">sprite provider <b>{provider}</b> · change in Settings (topbar ⚙)</div>
        {selectedProject?.manifestPath && <div className="gen-manifest">manifest {selectedProject.manifestPath}</div>}
        {selectedProject && !selectedProject.valid && <div className="project-error">{selectedProject.error}</div>}
        <button className="gen-btn" disabled={busy || !id || !prompt || !!(selectedProject && !selectedProject.valid)} onClick={generate}>
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
      </div>
    </div>
  );
}

function slugFromUrl(url: string): string {
  const m = url.match(/(?:v=|youtu\.be\/|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1].toLowerCase() : "ruleset";
}

function ResearchPane() {
  const [url, setUrl] = useState("");
  const [slug, setSlug] = useState("");
  const [provider, setProvider] = useState("codex");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState("");
  const [result, setResult] = useState<ResearchResult | null>(null);

  useEffect(() => {
    // Ressources distills with codex | mock only, not the image-gen providers.
    const off = window.studio?.onResearchLog((chunk) => setLog((l) => (l + chunk).slice(-8000)));
    return () => { off?.(); };
  }, []);

  async function distill() {
    if (!window.studio?.research) { setLog("studio bridge unavailable — restart the app"); return; }
    setBusy(true);
    setResult(null);
    setLog("");
    try {
      setResult(await window.studio.research({ url: url.trim(), slug: (slug.trim() || slugFromUrl(url)), provider }));
    } catch (e) {
      setLog(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gen">
      <div className="gen-form">
        <label className="gen-field gen-grow"><span>YouTube URL</span>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" />
        </label>
        <label className="gen-field"><span>Rules file slug</span>
          <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder={url ? slugFromUrl(url) : "ruleset"} />
        </label>
        <label className="gen-field"><span>Provider</span>
          <select value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="codex">codex — your subscription (no key)</option>
            <option value="mock">mock — offline (transcript only)</option>
          </select>
        </label>
        <button className="gen-btn" disabled={busy || !url.trim()} onClick={distill}>
          {busy ? "Distilling…" : "Distill rules"}
        </button>
        <p className="gen-note">Transcript via yt-dlp (recommended) → distilled to docs/rules/&lt;slug&gt;.md. Codex runs take a minute — watch the log.</p>
      </div>
      <div className="gen-preview">
        {result?.rules ? <pre className="gen-rules">{result.rules}</pre> : <div className="gen-preview-empty">{busy ? "distilling…" : "ruleset preview"}</div>}
        {(log || result) && <pre className={"gen-log" + (result && !result.ok ? " is-err" : "")}>{log || "—"}</pre>}
        {result?.path && <div className="gen-path">{result.path}</div>}
      </div>
    </div>
  );
}

// Audio transcode tool: any source audio → WebM/Opus (the studio format) straight into
// a game's src/assets/audio/<category>/, via ffmpeg in the Electron main process.
function MusicPane() {
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
    const off = window.studio?.onTranscodeLog((chunk) => setLog((l) => (l + chunk).slice(-8000)));
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

  return (
    <div className="gen">
      <div className="gen-form">
        <button className="set-btn" type="button" onClick={pick}>
          {files.length ? `${files.length} file(s) selected — change` : "Pick source audio…"}
        </button>
        {files.length > 0 && <p className="gen-note">{files.map((f) => f.split("/").pop()).join(", ")}</p>}
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
          <select value={category} onChange={(e) => setCategory(e.target.value as "sfx" | "music" | "voice")}>
            <option value="sfx">sfx</option>
            <option value="music">music</option>
            <option value="voice">voice</option>
          </select>
        </label>
        <label className="gen-field"><span>Opus bitrate (kbps)</span>
          <input type="number" min={32} max={320} value={bitrate} onChange={(e) => setBitrate(Number(e.target.value) || 128)} />
        </label>
        <label className="gen-field"><span><input type="checkbox" checked={normalize} onChange={(e) => setNormalize(e.target.checked)} /> loudnorm (recommended for SFX)</span></label>
        <button className="gen-btn" disabled={busy || !files.length || !!(selectedProject && !selectedProject.valid)} onClick={transcode}>
          {busy ? "Transcoding…" : "Transcode → WebM/Opus"}
        </button>
        <p className="gen-note">ffmpeg → opus into the game's audio folder · strips cover art · registers each output in assets.json with a license record. Generate new SFX with ElevenLabs SFX / OptimizerAI; music with Soundraw / Beatoven (avoid Udio/Suno for shipped in-game loops).</p>
      </div>
      <div className="gen-preview">
        {result?.outputs?.length
          ? <pre className="gen-rules">{result.outputs.map((o) => o.split("/").slice(-2).join("/")).join("\n")}</pre>
          : <div className="gen-preview-empty">{busy ? "transcoding…" : "outputs"}</div>}
        {(log || result) && <pre className={"gen-log" + (result && !result.ok ? " is-err" : "")}>{log || "—"}</pre>}
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
  const [board, setBoard] = useState<Moodboard>(emptyMoodboard("scourge-survivors"));
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
                <textarea defaultValue={item.text || ""} onBlur={(e) => updateNote(item, e.target.value)} />
              )}
            </article>
          ))}
        </div>
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
  const compareAssets = compare.map((id) => byId.get(id)).filter(Boolean) as GalleryAsset[];
  const lightboxAsset = lightbox ? byId.get(lightbox) || null : null;
  const lightboxIndex = lightboxAsset ? filtered.findIndex((a) => a.id === lightboxAsset.id) : -1;

  const togglePin = useCallback((id: string) => {
    setCompare((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 4 ? prev : [...prev, id]));
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
        <div className="modal-backdrop" onClick={() => setLightbox(null)}>
          <div className="gallery-lightbox" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <span className="modal-title">{lightboxAsset.id}</span>
              <div className="gallery-lightbox-nav">
                <button className="modal-close" aria-label="Previous" onClick={() => step(-1)}>‹</button>
                <span className="gallery-lightbox-count">{lightboxIndex + 1} / {filtered.length}</span>
                <button className="modal-close" aria-label="Next" onClick={() => step(1)}>›</button>
                <button className="modal-close" aria-label="Close" onClick={() => setLightbox(null)}>×</button>
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
            </div>
          </div>
        </div>
      )}
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
              {SECTIONS.filter((s) => s.group === group).map((s) => (
                <button key={s.id} type="button" className={"nav-item" + (s.id === active ? " is-active" : "")} onClick={() => setActive(s.id)}>
                  <span className="nav-glyph" aria-hidden="true">{s.glyph}</span>
                  {s.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">generator hub · v0.1.0</div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <span className="topbar-label">{section.group} / {section.label}</span>
          <button className="topbar-gear" title="Settings" aria-label="Settings" onClick={() => setSettingsOpen(true)}>⚙</button>
        </header>

        <main className="pane">
          <header className="pane-head">
            <div className="pane-eyebrow">{section.group}</div>
            <h1 className="pane-title">{section.label}</h1>
            <p className="pane-blurb">{section.blurb}</p>
          </header>
          <div className="pane-body">
            {active === "projects" ? <ProjectsPane /> : active === "gallery" ? <GalleryPane /> : active === "sprites" ? <SpritesPane /> : active === "music" ? <MusicPane /> : active === "moodboard" ? <MoodboardPane /> : active === "research" ? <ResearchPane /> : (
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
        <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <span className="modal-title">Settings</span>
              <button className="modal-close" aria-label="Close" onClick={() => setSettingsOpen(false)}>×</button>
            </div>
            <div className="modal-body"><SettingsPane /></div>
          </div>
        </div>
      )}
    </div>
  );
}
