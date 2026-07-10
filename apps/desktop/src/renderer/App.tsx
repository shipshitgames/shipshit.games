import { Settings as SettingsIcon } from "lucide-react";
import { useState, type ComponentType } from "react";

import { ModalBackdrop } from "./components/ModalBackdrop";
import { ModalHead } from "./components/ModalHead";
import { Sidebar } from "./components/Sidebar";
import { SECTIONS, type SectionId } from "./lib/sections";
import { GalleryPane } from "./panes/GalleryPane";
import { GymsPane } from "./panes/GymsPane";
import { LabPane } from "./panes/LabPane";
import { MapsPane } from "./panes/MapsPane";
import { ModelPane } from "./panes/ModelPane";
import { MoodboardPane } from "./panes/MoodboardPane";
import { MusicPane } from "./panes/MusicPane";
import { ProjectsPane } from "./panes/ProjectsPane";
import { ResearchPane } from "./panes/ResearchPane";
import { SettingsPane } from "./panes/SettingsPane";
import { SpritesPane } from "./panes/SpritesPane";
import { TerminalPane } from "./panes/TerminalPane";

// Studio cockpit shell. Sections not yet wired (codegen) fall through to the
// placeholder. Provider + keys are configured once in Settings (topbar gear).
const PANES: Partial<Record<SectionId, ComponentType>> = {
  projects: ProjectsPane,
  gyms: GymsPane,
  gallery: GalleryPane,
  maps: MapsPane,
  sprites: SpritesPane,
  music: MusicPane,
  "3d": ModelPane,
  moodboard: MoodboardPane,
  lab: LabPane,
  research: ResearchPane,
};

export default function App() {
  const [active, setActive] = useState<SectionId>("sprites");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const section = SECTIONS.find((s) => s.id === active) ?? SECTIONS[0];
  const Pane = PANES[section.id];

  return (
    <div className="studio">
      <Sidebar active={active} onSelect={setActive} />

      <div className="workspace">
        <header className="topbar">
          <span className="topbar-label">{section.group} / <b>{section.label}</b></span>
          <button className="btn btn-ghost btn-icon" type="button" title="Settings" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
            <SettingsIcon size={15} />
          </button>
        </header>

        <main className="pane">
          <header className="pane-head">
            <h1 className="pane-title">{section.label}</h1>
            <p className="pane-blurb">{section.blurb}</p>
          </header>
          <div className="pane-body">
            {Pane ? <Pane /> : (
              <div className="placeholder-card">
                <div className="placeholder-glyph" aria-hidden="true"><section.icon size={28} /></div>
                <p><strong>{section.label}</strong> workspace coming online.</p>
                <p className="placeholder-sub">Same shape as Sprites — wiring lands in a later issue.</p>
              </div>
            )}
          </div>
        </main>

        <TerminalPane />
      </div>

      {settingsOpen && (
        <ModalBackdrop onClose={() => setSettingsOpen(false)} label="Close settings">
          <div className="modal">
            <ModalHead title="Settings" onClose={() => setSettingsOpen(false)} />
            <div className="modal-body"><SettingsPane /></div>
          </div>
        </ModalBackdrop>
      )}
    </div>
  );
}
