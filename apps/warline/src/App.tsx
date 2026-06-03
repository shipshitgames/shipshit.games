import { useState } from 'react'
import { useWarline } from './store'
import { Header } from './components/Header'
import { ResourceBar } from './components/ResourceBar'
import { WarMap } from './components/WarMap'
import { WarFeed } from './components/WarFeed'
import { CommandPanel } from './components/CommandPanel'
import { OpsPanel } from './components/OpsPanel'
import { Legend } from './components/Legend'

export default function App() {
  const {
    state,
    summary,
    status,
    faction,
    setFaction,
    command,
    simulate,
  } = useWarline()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  return (
    <div className="min-h-screen bg-void text-ash">
      <Header state={state} summary={summary} status={status} />

      <main className="mx-auto max-w-[1400px] px-4 py-4 sm:px-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Map — large, spans two columns on lg */}
          <div className="lg:col-span-2">
            <WarMap
              state={state}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>

          {/* Right rail */}
          <div className="flex flex-col gap-4">
            <ResourceBar resources={state.resources} army={state.pactArmy} />
            <CommandPanel
              state={state}
              faction={faction}
              setFaction={setFaction}
              selectedId={selectedId}
              command={command}
            />
            <OpsPanel simulate={simulate} />
            <Legend />
          </div>
        </div>

        {/* Feed below, full width */}
        <div className="mt-4 h-80">
          <WarFeed feed={state.feed} />
        </div>
      </main>

      <footer className="border-t-2 border-gunmetal px-4 py-3 text-center sm:px-6">
        <p className="font-mono text-[0.65rem] text-ash">
          WARLINE · War for the Lanes ·{' '}
          {status === 'LOCAL'
            ? 'standalone simulation (no server)'
            : status === 'LIVE'
              ? 'live shared front'
              : 'connecting to the front…'}
        </p>
      </footer>
    </div>
  )
}
