import type { Faction, WarEvent } from '@shipshitgames/warline'

interface WarFeedProps {
  feed: WarEvent[]
}

const FACTION_DOT: Record<Faction, string> = {
  wardens: '#c1121f',
  pyre: '#ff6a00',
  scourge: '#8bdc1f',
  neutral: '#34343c',
}

function kindAccent(event: WarEvent): string {
  switch (event.kind) {
    case 'fall':
      return 'text-blood-hot'
    case 'seal':
      return 'text-toxic'
    case 'reset':
      return 'text-hellfire'
    case 'command':
      return 'text-bone'
    case 'system':
      return 'text-ash'
    default:
      return 'text-bone'
  }
}

export function WarFeed({ feed }: WarFeedProps) {
  return (
    <section className="flex h-full flex-col border-2 border-gunmetal bg-coal">
      <div className="flex items-center justify-between border-b border-gunmetal px-3 py-2">
        <h2 className="font-display text-sm tracking-wide text-bone">
          War Feed
        </h2>
        <span className="font-mono text-[0.65rem] text-ash">
          {feed.length} events
        </span>
      </div>

      <ol className="flex-1 divide-y divide-iron overflow-y-auto">
        {feed.length === 0 && (
          <li className="px-3 py-4 text-center text-xs text-ash">
            No activity yet. Run an operation or issue a command.
          </li>
        )}
        {feed.map((event) => (
          <li key={event.id} className="flex items-start gap-2 px-3 py-2">
            <span
              className="mt-1 inline-block h-2 w-2 shrink-0 border border-void"
              style={{ backgroundColor: FACTION_DOT[event.faction] }}
            />
            <div className="min-w-0 flex-1">
              <p className={`text-xs leading-snug ${kindAccent(event)}`}>
                {event.text}
                {event.sealed && (
                  <span className="ml-1 font-display text-toxic">[SEALED]</span>
                )}
              </p>
              <span className="font-mono text-[0.6rem] text-ash">
                t{event.t} · {event.kind}
                {event.game ? ` · ${event.game}` : ''}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
