import type { Faction } from '@shipshitgames/warline'

const FACTION_COLOR: Record<Faction, string> = {
  wardens: '#c1121f',
  pyre: '#ff6a00',
  scourge: '#8bdc1f',
  neutral: '#34343c',
}

const FACTION_ROWS: { faction: Faction; label: string }[] = [
  { faction: 'wardens', label: 'Wardens' },
  { faction: 'pyre', label: 'Pyre' },
  { faction: 'neutral', label: 'Neutral / Contested' },
  { faction: 'scourge', label: 'The Scourge' },
]

export function Legend() {
  return (
    <section className="border-2 border-gunmetal bg-coal p-3">
      <h2 className="mb-2 font-display text-xs tracking-wide text-ash">
        Legend
      </h2>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {FACTION_ROWS.map((row) => (
          <div key={row.faction} className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 border border-void"
              style={{ backgroundColor: FACTION_COLOR[row.faction] }}
            />
            <span className="text-xs text-ash">{row.label}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-col gap-1 border-t border-gunmetal pt-2">
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full bg-toxic" />
          <span className="text-xs text-ash">Active breach (pulses)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full border-2 border-blood" />
          <span className="text-xs text-ash">Pressure heat ring</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-bone">?</span>
          <span className="text-xs text-ash">Unrevealed — run Recon</span>
        </div>
      </div>
    </section>
  )
}
