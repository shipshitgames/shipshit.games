import { Biohazard } from "lucide-react";

import { GROUPS, SECTIONS, type SectionId } from "../lib/sections";

export function Sidebar({ active, onSelect }: { active: SectionId; onSelect: (id: SectionId) => void }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark"><Biohazard size={18} /></span>
        <div className="brand-text"><strong>Ship Shit</strong><span>Studio</span></div>
      </div>
      <nav className="nav">
        {GROUPS.map((group) => (
          <div className="nav-group" key={group}>
            <div className="nav-group-label">{group}</div>
            {SECTIONS.flatMap((s) => s.group === group ? [(
              <button key={s.id} type="button" className={"nav-item" + (s.id === active ? " is-active" : "")} onClick={() => onSelect(s.id)}>
                <span className="nav-glyph" aria-hidden="true"><s.icon size={14} /></span>
                {s.label}
              </button>
            )] : [])}
          </div>
        ))}
      </nav>
      <div className="sidebar-foot">generator hub · v0.1.0</div>
    </aside>
  );
}
