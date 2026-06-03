import { useEffect, useState } from "react";

// Studio cockpit: left sidebar of generator + codegen sections, a main pane that
// swaps per section, and a bottom "terminal" placeholder. The Sprites pane is wired
// to @shipshit/assetgen via the studio IPC bridge; the others land in later issues.

type SectionId = "maps" | "sprites" | "music" | "3d" | "codegen";

type Section = {
  id: SectionId;
  label: string;
  group: "Generators" | "Codegen";
  glyph: string;
  blurb: string;
};

interface GenResult {
  ok: boolean;
  log: string;
  path: string | null;
  dataUrl: string | null;
}

declare global {
  interface Window {
    studio?: {
      platform: string;
      versions: Record<string, string>;
      generate: (opts: {
        id: string;
        prompt: string;
        provider: string;
        game: string;
        kind: string;
      }) => Promise<GenResult>;
      listGames: () => Promise<string[]>;
      terminal: { onData: (l: (d: string) => void) => () => void; write: (d: string) => void };
    };
  }
}

const SECTIONS: Section[] = [
  { id: "maps", label: "Maps", group: "Generators", glyph: "▞", blurb: "Breach-zone layouts and arena maps for the Scourge front." },
  { id: "sprites", label: "Sprites", group: "Generators", glyph: "✦", blurb: "Forge DOOM-grade billboards and enemy cutouts — straight into a game's assets." },
  { id: "music", label: "Music + SFX", group: "Generators", glyph: "♪", blurb: "Brutal scores and combat SFX for the shipshitshow." },
  { id: "3d", label: "3D", group: "Generators", glyph: "◈", blurb: "Meshes, props and Warden engineering for the 3D titles." },
  { id: "codegen", label: "Codegen", group: "Codegen", glyph: "λ", blurb: "Plan → Review → Execute → Verify → Ship over the local CLI." },
];

const GROUPS: Array<Section["group"]> = ["Generators", "Codegen"];

function SpritesPane() {
  const [id, setId] = useState("swarm-husk");
  const [prompt, setPrompt] = useState("a rotting bio-husk of the Scourge, mid-lunge, gore");
  const [provider, setProvider] = useState("codex");
  const [game, setGame] = useState("scourge-survivors");
  const [games, setGames] = useState<string[]>(["scourge-survivors"]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GenResult | null>(null);

  useEffect(() => {
    window.studio?.listGames?.().then((g) => { if (g?.length) { setGames(g); setGame(g[0]); } }).catch(() => {});
  }, []);

  async function generate() {
    if (!window.studio?.generate) {
      setResult({ ok: false, log: "studio bridge unavailable (restart the app)", path: null, dataUrl: null });
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      setResult(await window.studio.generate({ id, prompt, provider, game, kind: "sprite" }));
    } catch (e) {
      setResult({ ok: false, log: String((e as Error)?.message ?? e), path: null, dataUrl: null });
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
        <div className="gen-row">
          <label className="gen-field"><span>Game</span>
            <select value={game} onChange={(e) => setGame(e.target.value)}>
              {games.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
          <label className="gen-field"><span>Provider</span>
            <select value={provider} onChange={(e) => setProvider(e.target.value)}>
              <option value="codex">codex (your auth)</option>
              <option value="openai">openai (gpt-image-2)</option>
              <option value="fal">fal</option>
              <option value="mock">mock (test)</option>
            </select>
          </label>
        </div>
        <button className="gen-btn" disabled={busy || !id || !prompt} onClick={generate}>
          {busy ? "Forging…" : "Generate"}
        </button>
        <p className="gen-note">Auto-styled with the DOOM DESIGN.md suffix · writes the .webp + updates the game's assets.json</p>
      </div>
      <div className="gen-preview">
        {result?.dataUrl ? (
          <img src={result.dataUrl} alt={id} />
        ) : (
          <div className="gen-preview-empty">{busy ? "forging…" : "preview"}</div>
        )}
        {result && <pre className={"gen-log" + (result.ok ? "" : " is-err")}>{result.log || (result.ok ? "done" : "failed")}</pre>}
        {result?.path && <div className="gen-path">{result.path}</div>}
      </div>
    </div>
  );
}

export default function App() {
  const [active, setActive] = useState<SectionId>("sprites");
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
        <main className="pane">
          <header className="pane-head">
            <div className="pane-eyebrow">{section.group}</div>
            <h1 className="pane-title">{section.label}</h1>
            <p className="pane-blurb">{section.blurb}</p>
          </header>
          <div className="pane-body">
            {active === "sprites" ? (
              <SpritesPane />
            ) : (
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
            <span className="terminal-hint">xterm / node-pty wiring pending</span>
          </div>
          <div className="terminal-body">
            <span className="terminal-prompt">shipshit&nbsp;~&nbsp;studio&nbsp;$</span>
            <span className="terminal-caret" aria-hidden="true">▋</span>
          </div>
        </section>
      </div>
    </div>
  );
}
