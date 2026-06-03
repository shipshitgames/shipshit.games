import { useState } from "react";

// Studio cockpit: left sidebar of generator + codegen sections, a main pane that
// swaps per section, and a bottom "terminal" placeholder. The PTY/xterm and the
// real generator/codegen wiring land in later issues — this is the shell.

type SectionId = "maps" | "sprites" | "music" | "3d" | "codegen";

type Section = {
  id: SectionId;
  label: string;
  group: "Generators" | "Codegen";
  glyph: string;
  blurb: string;
};

const SECTIONS: Section[] = [
  {
    id: "maps",
    label: "Maps",
    group: "Generators",
    glyph: "▞",
    blurb: "Procedural breach-zone layouts and arena maps for the Scourge front.",
  },
  {
    id: "sprites",
    label: "Sprites",
    group: "Generators",
    glyph: "✦",
    blurb: "Chroma-key character billboards and enemy cutouts via the asset pipeline.",
  },
  {
    id: "music",
    label: "Music + SFX",
    group: "Generators",
    glyph: "♪",
    blurb: "Neon-industrial scores and combat SFX for the shipshitshow.",
  },
  {
    id: "3d",
    label: "3D",
    group: "Generators",
    glyph: "◈",
    blurb: "Meshes, props and Warden engineering for the 3D titles.",
  },
  {
    id: "codegen",
    label: "Codegen",
    group: "Codegen",
    glyph: "λ",
    blurb: "Plan → Review → Execute → Verify → Ship orchestration over the local CLI.",
  },
];

const GROUPS: Array<Section["group"]> = ["Generators", "Codegen"];

export default function App() {
  const [active, setActive] = useState<SectionId>("maps");
  const section = SECTIONS.find((s) => s.id === active) ?? SECTIONS[0];

  return (
    <div className="studio">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">☣</span>
          <div className="brand-text">
            <strong>SHIP SHIT</strong>
            <span>STUDIO</span>
          </div>
        </div>

        <nav className="nav">
          {GROUPS.map((group) => (
            <div className="nav-group" key={group}>
              <div className="nav-group-label">{group}</div>
              {SECTIONS.filter((s) => s.group === group).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={"nav-item" + (s.id === active ? " is-active" : "")}
                  onClick={() => setActive(s.id)}
                >
                  <span className="nav-glyph" aria-hidden="true">
                    {s.glyph}
                  </span>
                  {s.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">generator hub · v0.0.0</div>
      </aside>

      <div className="workspace">
        <main className="pane">
          <header className="pane-head">
            <div className="pane-eyebrow">{section.group}</div>
            <h1 className="pane-title">{section.label}</h1>
            <p className="pane-blurb">{section.blurb}</p>
          </header>

          <div className="pane-body">
            <div className="placeholder-card">
              <div className="placeholder-glyph" aria-hidden="true">
                {section.glyph}
              </div>
              <p>
                <strong>{section.label}</strong> workspace coming online.
              </p>
              <p className="placeholder-sub">
                Controls and previews land in a later issue.
              </p>
            </div>
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
            <span className="terminal-caret" aria-hidden="true">
              ▋
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}
