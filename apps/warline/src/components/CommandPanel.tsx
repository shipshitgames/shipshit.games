import type {
  Command,
  CommandKind,
  HumanFaction,
  Region,
  WorldState,
} from '@shipshitgames/warline'
import { canAfford, COMMAND_COSTS, regionById } from '@shipshitgames/warline'

interface CommandPanelProps {
  state: WorldState
  faction: HumanFaction
  setFaction: (f: HumanFaction) => void
  selectedId: string | null
  command: (cmd: Command) => void
}

interface CommandDef {
  kind: CommandKind
  label: string
  needsRegion: boolean
  hint: string
}

const COMMANDS: CommandDef[] = [
  {
    kind: 'fortify',
    label: 'Fortify',
    needsRegion: true,
    hint: '+defense, −pressure on a held region',
  },
  {
    kind: 'muster',
    label: 'Muster',
    needsRegion: false,
    hint: '+army strength',
  },
  {
    kind: 'deploy',
    label: 'Deploy',
    needsRegion: true,
    hint: '−pressure; recapture scourge / claim neutral',
  },
  {
    kind: 'recon',
    label: 'Recon',
    needsRegion: true,
    hint: 'reveal an unknown sector',
  },
]

function costLabel(kind: CommandKind): string {
  const cost = COMMAND_COSTS[kind]
  const parts: string[] = []
  for (const [k, v] of Object.entries(cost)) {
    if (typeof v === 'number') parts.push(`${v} ${k}`)
  }
  return parts.join(' · ')
}

const FACTIONS: HumanFaction[] = ['pyre', 'wardens']

function isHuman(r: Region): boolean {
  return r.faction === 'pyre' || r.faction === 'wardens'
}

export function CommandPanel({
  state,
  faction,
  setFaction,
  selectedId,
  command,
}: CommandPanelProps) {
  const selected = selectedId ? regionById(state, selectedId) : undefined

  function disabledReason(def: CommandDef): string | null {
    if (!canAfford(state, def.kind)) return 'Insufficient resources'
    if (def.needsRegion && !selected) return 'Select a region'
    if (def.kind === 'fortify' && selected && !isHuman(selected))
      return 'Region not held by the Pact'
    return null
  }

  function run(def: CommandDef) {
    if (disabledReason(def)) return
    if (def.kind === 'muster') {
      command({ kind: 'muster', faction })
      return
    }
    if (!selected) return
    if (def.kind === 'fortify')
      command({ kind: 'fortify', regionId: selected.id, faction })
    else if (def.kind === 'deploy')
      command({ kind: 'deploy', regionId: selected.id, faction })
    else if (def.kind === 'recon')
      command({ kind: 'recon', regionId: selected.id, faction })
  }

  return (
    <section className="border-2 border-gunmetal bg-coal p-3">
      <h2 className="mb-2 font-display text-xs tracking-wide text-ash">
        Command
      </h2>

      {/* faction toggle */}
      <div className="mb-3 flex border-2 border-gunmetal">
        {FACTIONS.map((f) => {
          const active = f === faction
          const activeClass =
            f === 'pyre' ? 'bg-hellfire text-bone' : 'bg-blood text-bone'
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFaction(f)}
              className={`flex-1 px-2 py-1.5 font-display text-xs tracking-wide transition-colors ${
                active ? activeClass : 'bg-iron text-ash hover:text-bone'
              }`}
              style={active ? { boxShadow: 'var(--shadow-ember)' } : undefined}
            >
              {f.toUpperCase()}
            </button>
          )
        })}
      </div>

      {/* selected region */}
      <div className="mb-3 border border-gunmetal bg-iron px-2 py-1.5">
        <span className="font-display text-[0.6rem] tracking-wide text-ash">
          Selected Region
        </span>
        {selected ? (
          <div className="mt-0.5">
            <p className="font-display text-sm text-bone">{selected.name}</p>
            <p className="font-mono text-[0.65rem] text-ash">
              {selected.faction} · P {Math.round(selected.pressure)} · D{' '}
              {Math.round(selected.defense)}
            </p>
          </div>
        ) : (
          <p className="mt-0.5 text-xs text-ash">None — click the map</p>
        )}
      </div>

      {/* command buttons */}
      <div className="flex flex-col gap-2">
        {COMMANDS.map((def) => {
          const reason = disabledReason(def)
          const disabled = reason !== null
          return (
            <button
              key={def.kind}
              type="button"
              disabled={disabled}
              onClick={() => run(def)}
              title={reason ?? def.hint}
              className={`flex items-center justify-between border-2 px-2.5 py-1.5 text-left transition-colors ${
                disabled
                  ? 'cursor-not-allowed border-gunmetal bg-iron opacity-50'
                  : 'border-blood bg-iron hover:bg-blood/20'
              }`}
            >
              <span className="flex flex-col">
                <span className="font-display text-sm tracking-wide text-bone">
                  {def.label}
                </span>
                <span className="font-mono text-[0.6rem] text-ash">
                  {costLabel(def.kind)}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
