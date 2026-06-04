import { useState } from 'react'
import type { Faction, Region, WorldState } from '@shipshitgames/warline'
import { breachById, regionById } from '@shipshitgames/warline'

interface WarMapProps {
  state: WorldState
  selectedId: string | null
  onSelect: (id: string) => void
}

const FACTION_COLOR: Record<Faction, string> = {
  wardens: '#c1121f',
  pyre: '#ff6a00',
  scourge: '#8bdc1f',
  neutral: '#34343c',
}

function laneStroke(control: Faction): string {
  return FACTION_COLOR[control]
}

// Higher flow => thicker, more aggressively dashed lane (the Scourge surges).
function laneWidth(flow: number): number {
  return 0.4 + (flow / 100) * 1.4
}

function laneDash(flow: number): string | undefined {
  if (flow >= 60) return '2 1.5'
  if (flow >= 40) return '3 2'
  return undefined
}

interface Hover {
  x: number
  y: number
  title: string
  lines: string[]
}

export function WarMap({ state, selectedId, onSelect }: WarMapProps) {
  const [hover, setHover] = useState<Hover | null>(null)

  return (
    <section className="relative border-2 border-gunmetal bg-coal">
      <div className="flex items-center justify-between border-b border-gunmetal px-3 py-2">
        <h2 className="font-display text-sm tracking-wide text-bone">
          The Front
        </h2>
        <span className="font-mono text-[0.65rem] text-ash">
          {state.regions.length} regions · {state.lanes.length} lanes ·{' '}
          {state.breaches.filter((b) => b.active).length} active breaches
        </span>
      </div>

      <div className="relative">
        <svg
          viewBox="0 0 100 100"
          className="block w-full"
          style={{ aspectRatio: '1 / 1', background: '#0a0a0a' }}
          role="img"
          aria-label="War map of the front"
        >
          {/* faint grid backdrop */}
          <g stroke="#1e1e22" strokeWidth={0.15}>
            {[20, 40, 60, 80].map((g) => (
              <line key={`gx${g}`} x1={g} y1={0} x2={g} y2={100} />
            ))}
            {[20, 40, 60, 80].map((g) => (
              <line key={`gy${g}`} x1={0} y1={g} x2={100} y2={g} />
            ))}
          </g>

          {/* lanes */}
          <g>
            {state.lanes.map((lane) => {
              const a = regionById(state, lane.from)
              const b = regionById(state, lane.to)
              if (!a || !b) return null
              const midX = (a.x + b.x) / 2
              const midY = (a.y + b.y) / 2
              return (
                <line
                  key={lane.id}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={laneStroke(lane.control)}
                  strokeWidth={laneWidth(lane.flow)}
                  strokeOpacity={0.55}
                  strokeDasharray={laneDash(lane.flow)}
                  strokeLinecap="butt"
                  onMouseEnter={() =>
                    setHover({
                      x: midX,
                      y: midY,
                      title: lane.name,
                      lines: [
                        `Control: ${lane.control}`,
                        `Flow: ${Math.round(lane.flow)}`,
                      ],
                    })
                  }
                  onMouseLeave={() => setHover(null)}
                  style={{ cursor: 'help' }}
                />
              )
            })}
          </g>

          {/* regions */}
          <g>
            {state.regions.map((region) => (
              <RegionNode
                key={region.id}
                state={state}
                region={region}
                selected={region.id === selectedId}
                onSelect={onSelect}
                onHover={setHover}
              />
            ))}
          </g>
        </svg>

        {hover && (
          <div
            className="pointer-events-none absolute z-10 max-w-[14rem] -translate-x-1/2 -translate-y-full border border-hellfire bg-void/95 px-2 py-1 shadow-[var(--shadow-ember)]"
            style={{ left: `${hover.x}%`, top: `${hover.y}%` }}
          >
            <div className="font-display text-xs tracking-wide text-bone">
              {hover.title}
            </div>
            {hover.lines.map((line) => (
              <div key={line} className="font-mono text-[0.65rem] text-ash">
                {line}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

interface RegionNodeProps {
  state: WorldState
  region: Region
  selected: boolean
  onSelect: (id: string) => void
  onHover: (h: Hover | null) => void
}

function RegionNode({
  state,
  region,
  selected,
  onSelect,
  onHover,
}: RegionNodeProps) {
  const fill = FACTION_COLOR[region.faction]
  const isScourge = region.faction === 'scourge'
  const isHidden = isScourge && !region.revealed
  const radius = 3.4
  const ringR = radius + 1.6
  // Pressure heat ring — fraction of the circumference filled (red), like a gauge.
  const pressure = Math.max(0, Math.min(100, region.pressure))
  const circumference = 2 * Math.PI * ringR
  const filled = (pressure / 100) * circumference

  const breach = region.breachId
    ? breachById(state, region.breachId)
    : undefined
  const breachActive = breach?.active ?? false

  const hoverLines = isHidden
    ? ['Unknown — run Recon to reveal']
    : [
        `Faction: ${region.faction}`,
        `Pressure: ${Math.round(region.pressure)}`,
        `Defense: ${Math.round(region.defense)}`,
        ...(breach
          ? [
              `Breach: ${breach.name}`,
              `Intensity: ${Math.round(breach.intensity)}${
                breach.active ? '' : ' (sealed)'
              }`,
            ]
          : []),
      ]

  return (
    <g
      onClick={() => onSelect(region.id)}
      onMouseEnter={() =>
        onHover({
          x: region.x,
          y: region.y - radius - 4,
          title: isHidden ? 'Unrevealed Sector' : region.name,
          lines: hoverLines,
        })
      }
      onMouseLeave={() => onHover(null)}
      style={{ cursor: 'pointer' }}
    >
      {/* pressure heat ring */}
      {!isHidden && pressure > 0 && (
        <circle
          cx={region.x}
          cy={region.y}
          r={ringR}
          fill="none"
          stroke="#ff2a18"
          strokeWidth={0.9}
          strokeOpacity={0.85}
          strokeDasharray={`${filled} ${circumference}`}
          transform={`rotate(-90 ${region.x} ${region.y})`}
          strokeLinecap="butt"
        />
      )}

      {/* active breach pulse */}
      {breachActive && (
        <circle
          cx={region.x}
          cy={region.y}
          r={ringR + 1.4}
          fill="none"
          stroke="#8bdc1f"
          strokeWidth={0.8}
          style={{
            transformBox: 'fill-box',
            transformOrigin: 'center',
            animation: 'var(--animate-breachpulse)',
          }}
        />
      )}

      {/* selection halo */}
      {selected && (
        <circle
          cx={region.x}
          cy={region.y}
          r={ringR + 2.6}
          fill="none"
          stroke="#e9e3d6"
          strokeWidth={0.6}
          strokeDasharray="1 1"
        />
      )}

      {/* node body */}
      <circle
        cx={region.x}
        cy={region.y}
        r={radius}
        fill={isHidden ? '#1e1e22' : fill}
        stroke={selected ? '#e9e3d6' : '#0a0a0a'}
        strokeWidth={selected ? 0.8 : 0.4}
      />

      {/* defense pip — inner dot scaled by fortification */}
      {!isHidden && region.defense > 0 && (
        <circle
          cx={region.x}
          cy={region.y}
          r={Math.max(0.5, (region.defense / 100) * (radius - 0.8))}
          fill="#0a0a0a"
          fillOpacity={0.55}
        />
      )}

      {/* hidden marker */}
      {isHidden && (
        <text
          x={region.x}
          y={region.y + 1.4}
          textAnchor="middle"
          fontSize={4}
          fontFamily="monospace"
          fill="#9b958a"
        >
          ?
        </text>
      )}

      {/* name label */}
      <text
        x={region.x}
        y={region.y + radius + 3.2}
        textAnchor="middle"
        fontSize={2.6}
        fontFamily="Oswald, sans-serif"
        fontWeight={700}
        fill={isHidden ? '#9b958a' : '#e9e3d6'}
        style={{ textTransform: 'uppercase', pointerEvents: 'none' }}
      >
        {isHidden ? '???' : region.name}
      </text>
    </g>
  )
}
