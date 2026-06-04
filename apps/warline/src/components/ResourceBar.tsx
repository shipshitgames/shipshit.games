import type { ResourceBag, ResourceKind } from '@shipshitgames/warline'
import { RESOURCE_KINDS } from '@shipshitgames/warline'

interface ResourceBarProps {
  resources: ResourceBag
  army: number
}

const RESOURCE_LABEL: Record<ResourceKind, string> = {
  scrap: 'SCRAP',
  biomass: 'BIOMASS',
  fuel: 'FUEL',
  intel: 'INTEL',
}

const RESOURCE_ACCENT: Record<ResourceKind, string> = {
  scrap: 'text-bone',
  biomass: 'text-toxic',
  fuel: 'text-hellfire',
  intel: 'text-ash',
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

export function ResourceBar({ resources, army }: ResourceBarProps) {
  return (
    <section className="border-2 border-gunmetal bg-coal p-3">
      <h2 className="mb-2 font-display text-xs tracking-wide text-ash">
        Pact War Pool
      </h2>
      <div className="grid grid-cols-2 gap-2">
        {RESOURCE_KINDS.map((kind) => (
          <div
            key={kind}
            className="flex flex-col border border-gunmetal bg-iron px-2 py-1.5"
          >
            <span className="font-display text-[0.65rem] tracking-wide text-ash">
              {RESOURCE_LABEL[kind]}
            </span>
            <span
              className={`font-mono text-lg leading-tight ${RESOURCE_ACCENT[kind]}`}
            >
              {fmt(resources[kind])}
            </span>
          </div>
        ))}
        <div className="col-span-2 flex items-center justify-between border border-blood bg-iron px-2 py-1.5">
          <span className="font-display text-[0.65rem] tracking-wide text-blood">
            PACT ARMY
          </span>
          <span className="font-mono text-lg leading-tight text-bone">
            {fmt(army)}
          </span>
        </div>
      </div>
    </section>
  )
}
