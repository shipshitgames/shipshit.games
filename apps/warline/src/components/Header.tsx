import type { Summary, WorldState } from '@shipshitgames/warline'
import type { WarlineStatus } from '../store'

interface HeaderProps {
  state: WorldState
  summary: Summary
  status: WarlineStatus
}

function statusColor(status: WarlineStatus): string {
  if (status === 'LIVE') return 'border-toxic text-toxic'
  if (status === 'CONNECTING') return 'border-hellfire text-hellfire'
  return 'border-gunmetal text-ash'
}

export function Header({ state, summary, status }: HeaderProps) {
  const threat = Math.round(summary.threat)
  return (
    <header className="border-b-2 border-gunmetal bg-coal px-4 py-3 sm:px-6">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-2xl leading-none text-bone sm:text-3xl">
            WARLINE
          </h1>
          <span className="font-display text-xs tracking-wide text-hellfire sm:text-sm">
            War for the Lanes
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 font-mono text-xs text-ash">
            <span>
              EPOCH <span className="text-bone">{state.epoch}</span>
            </span>
            <span className="text-gunmetal">/</span>
            <span>
              TICK <span className="text-bone">{state.tick}</span>
            </span>
          </div>

          <span
            className={`border-2 px-2 py-0.5 font-display text-xs tracking-wide ${statusColor(
              status,
            )}`}
          >
            {status}
          </span>

          <div className="flex items-center gap-2">
            <span className="font-display text-xs tracking-wide text-ash">
              THREAT
            </span>
            <div className="h-2.5 w-32 border border-gunmetal bg-void">
              <div
                className="h-full bg-blood"
                style={{
                  width: `${threat}%`,
                  boxShadow:
                    threat > 60
                      ? '0 0 10px -1px rgba(255,42,24,0.8)'
                      : undefined,
                }}
              />
            </div>
            <span className="font-mono text-xs text-bone">{threat}</span>
          </div>
        </div>
      </div>
    </header>
  )
}
