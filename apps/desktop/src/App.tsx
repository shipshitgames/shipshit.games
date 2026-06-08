import { useEffect, useState } from "react";

// Studio cockpit. Sprites is wired to @shipshitgames/assetgen via the studio IPC bridge with a
// live streaming log. Provider + keys are configured once in Settings (topbar gear).
// Default provider = codex CLI (your subscription — no API key).

type SectionId = "maps" | "sprites" | "music" | "3d" | "research" | "codegen";
type Group = "Generators" | "Ressources" | "Codegen";
type Section = { id: SectionId; label: string; group: Group; glyph: string; blurb: string };

interface GenResult { ok: boolean; log: string; path: string | null; dataUrl: string | null }
interface ResearchResult { ok: boolean; log: string; path: string | null; rules: string | null }
interface Settings { defaultProvider: string; defaultGame: string; providerDefaults: Record<string, string> }

declare global {
  interface Window {
    studio?: {
      platform: string;
      versions: Record<string, string>;
      generate: (opts: { id: string; prompt: string; game: string; kind: string; provider?: string }) => Promise<GenResult>;
      listGames: () => Promise<string[]>;
      onGenLog: (cb: (chunk: string) => void) => () => void;
      research: (opts: { url: string; slug: string; provider?: string }) => Promise<ResearchResult>;
      onResearchLog: (cb: (chunk: string) => void) => () => void;
      transcodeAudio: (opts: { files: string[]; game: string; category: string; bitrate?: number; normalize?: boolean }) => Promise<{ ok: boolean; log: string; outputs: string[] }>;
      pickAudioFiles: () => Promise<string[]>;
      onTranscodeLog: (cb: (chunk: string) => void) => () => void;
      settings: { get: () => Promise<Settings>; set: (p: Partial<Settings>) => Promise<Settings> };
      keys: { status: () => Promise<Record<string, boolean>>; set: (provider: string, key: string) => Promise<Record<string, boolean>> };
    };
  }
}

const SECTIONS: Section[] = [
  { id: "maps", label: "Maps", group: "Generators", glyph: "▞", blurb: "Breach-zone layouts and arena maps for the Scourge front." },
  { id: "sprites", label: "Sprites", group: "Generators", glyph: "✦", blurb: "Forge DOOM-grade billboards and enemy cutouts — straight into a game's assets." },
  { id: "music", label: "Music + SFX", group: "Generators", glyph: "♪", blurb: "Brutal scores and combat SFX for the shipshitshow." },
  { id: "3d", label: "3D", group: "Generators", glyph: "◈", blurb: "Meshes, props and Warden engineering for the 3D titles." },
  { id: "research", label: "Rules", group: "Ressources", glyph: "📖", blurb: "Distill a YouTube game-dev tutorial into a reusable build ruleset." },
  { id: "codegen", label: "Codegen", group: "Codegen", glyph: "λ", blurb: "Plan → Review → Execute → Verify → Ship over the local CLI." },
];
const GROUPS: Group[] = ["Generators", "Ressources", "Codegen"];

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
  };
}

function SettingsPane() {
  const [settings, setSettings] = useState<Settings>(withSettingsDefaults({}));
  const [games, setGames] = useState<string[]>(["scourge-survivors"]);
  const [status, setStatus] = useState<Record<string, boolean>>({});
  const [inputs, setInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    window.studio?.settings.get().then((s) => setSettings(withSettingsDefaults(s))).catch(() => {});
    window.studio?.keys.status().then(setStatus).catch(() => {});
    window.studio?.listGames().then((g) => g?.length && setGames(g)).catch(() => {});
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

function SpritesPane() {
  const [id, setId] = useState("swarm-husk");
  const [prompt, setPrompt] = useState("a rotting bio-husk of the Scourge, mid-lunge, gore");
  const [game, setGame] = useState("scourge-survivors");
  const [games, setGames] = useState<string[]>(["scourge-survivors"]);
  const [provider, setProvider] = useState("codex");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState("");
  const [result, setResult] = useState<GenResult | null>(null);

  useEffect(() => {
    window.studio?.settings.get().then((s) => {
      const next = withSettingsDefaults(s);
      setProvider(next.providerDefaults.sprite || next.defaultProvider);
      setGame(next.defaultGame);
    }).catch(() => {});
    window.studio?.listGames().then((g) => g?.length && setGames(g)).catch(() => {});
    const off = window.studio?.onGenLog((chunk) => setLog((l) => (l + chunk).slice(-8000)));
    return () => { off?.(); };
  }, []);

  async function generate() {
    if (!window.studio?.generate) { setLog("studio bridge unavailable — restart the app"); return; }
    setBusy(true);
    setResult(null);
    setLog("");
    try {
      setResult(await window.studio.generate({ id, prompt, game, kind: "sprite" }));
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
          <select value={game} onChange={(e) => setGame(e.target.value)}>
            {games.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        <div className="gen-active">sprite provider <b>{provider}</b> · change in Settings (topbar ⚙)</div>
        <button className="gen-btn" disabled={busy || !id || !prompt} onClick={generate}>
          {busy ? "Forging…" : "Generate"}
        </button>
        <p className="gen-note">Auto-styled with the DOOM DESIGN.md suffix · writes the .webp + updates the game's assets.json. Codex runs take a minute — watch the log.</p>
      </div>
      <div className="gen-preview">
        {result?.dataUrl ? <img src={result.dataUrl} alt={id} /> : <div className="gen-preview-empty">{busy ? "forging…" : "preview"}</div>}
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
  const [category, setCategory] = useState<"sfx" | "music" | "voice">("music");
  const [bitrate, setBitrate] = useState(128);
  const [normalize, setNormalize] = useState(false);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState("");
  const [result, setResult] = useState<{ ok: boolean; log: string; outputs: string[] } | null>(null);

  useEffect(() => {
    window.studio?.settings.get().then((s) => setGame(s.defaultGame)).catch(() => {});
    window.studio?.listGames().then((g) => g?.length && setGames(g)).catch(() => {});
    const off = window.studio?.onTranscodeLog((chunk) => setLog((l) => (l + chunk).slice(-8000)));
    return () => { off?.(); };
  }, []);

  async function pick() {
    const f = await window.studio?.pickAudioFiles();
    if (f?.length) setFiles(f);
  }

  async function transcode() {
    if (!window.studio?.transcodeAudio) { setLog("studio bridge unavailable — restart the app"); return; }
    setBusy(true);
    setResult(null);
    setLog("");
    try {
      setResult(await window.studio.transcodeAudio({ files, game, category, bitrate, normalize }));
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
          <select value={game} onChange={(e) => setGame(e.target.value)}>
            {games.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
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
        <button className="gen-btn" disabled={busy || !files.length} onClick={transcode}>
          {busy ? "Transcoding…" : "Transcode → WebM/Opus"}
        </button>
        <p className="gen-note">ffmpeg → opus into the game's audio folder · strips cover art · then register each in assets.json with a license record. Generate new SFX with ElevenLabs SFX / OptimizerAI; music with Soundraw / Beatoven (avoid Udio/Suno for shipped in-game loops).</p>
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
            {active === "sprites" ? <SpritesPane /> : active === "music" ? <MusicPane /> : active === "research" ? <ResearchPane /> : (
              <div className="placeholder-card">
                <div className="placeholder-glyph" aria-hidden="true">{section.glyph}</div>
                <p><strong>{section.label}</strong> workspace coming online.</p>
                <p className="placeholder-sub">Same shape as Sprites — wiring lands in a later issue.</p>
              </div>
            )}
          </div>
        </main>

        <section className="terminal" aria-label="Terminal">
          <div className="terminal-bar">
            <span className="terminal-dot" />
            <span className="terminal-title">terminal</span>
            <span className="terminal-hint">assetgen streams Codex through node-pty</span>
          </div>
          <div className="terminal-body">
            <span className="terminal-prompt">shipshit&nbsp;~&nbsp;studio&nbsp;$</span>
            <span className="terminal-caret" aria-hidden="true">▋</span>
          </div>
        </section>
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
