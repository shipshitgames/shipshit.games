import type { GameSlug } from '@shipshitgames/warline'
import { GAME_OPERATIONS } from '@shipshitgames/warline'

interface OpsPanelProps {
  simulate: (game?: GameSlug) => void
}

const GAME_SLUGS: GameSlug[] = [
  'scourge-survivors',
  'deadlane',
  'pactfall',
  'starblight',
  'redline',
  'rothulk',
]

export function OpsPanel({ simulate }: OpsPanelProps) {
  return (
    <section className="border-2 border-gunmetal bg-coal p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="font-display text-xs tracking-wide text-ash">
          Demo · Operation Feed
        </h2>
        <span className="font-mono text-[0.6rem] text-hellfire">SIMULATE</span>
      </div>
      <p className="mb-2 text-[0.65rem] leading-snug text-ash">
        Each Ship Shit Game reports an operation that credits the shared war.
        Fire one to push the front.
      </p>

      <div className="flex flex-col gap-2">
        {GAME_SLUGS.map((slug) => {
          const meta = GAME_OPERATIONS[slug]
          return (
            <button
              key={slug}
              type="button"
              onClick={() => simulate(slug)}
              title={meta.blurb}
              className="flex flex-col border-2 border-hellfire bg-iron px-2.5 py-1.5 text-left transition-colors hover:bg-hellfire/20"
            >
              <span className="flex items-center justify-between">
                <span className="font-display text-sm tracking-wide text-bone">
                  {meta.label}
                </span>
                <span className="font-mono text-[0.6rem] text-hellfire">
                  {slug}
                </span>
              </span>
              <span className="font-mono text-[0.6rem] text-ash">
                {meta.kind} → {meta.resources.join(', ')}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
