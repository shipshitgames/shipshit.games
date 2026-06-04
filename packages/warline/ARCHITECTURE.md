# Warline — architecture & contract (EPIC shipshitgames#34)

> **War for the Lanes** — a persistent OGame/Foxhole-style strategy hub that links every
> Ship Shit Game. One shared planet front (regions / lanes / breaches); three factions
> (Pyre + Wardens under **The Pact** vs the **Scourge**); four resources; a build / raise-army
> loop. Each mini-game is an **operation** that credits the shared war.
>
> This file is the **single source of truth**. `@shipshitgames/warline` (this package), the
> PartyKit server (`apps/warline/party`), and the web hub (`apps/warline/src`) all implement
> exactly the types, signatures, constants, map data, and protocol below. Do not diverge.

## Design decisions (locked)

- **Full living world.** The Scourge presses every tick: breaches pump pressure, pressure
  spreads along lanes, and human regions can **fall**. Players push back with operations +
  build/deploy. Territory flips both ways.
- **Open shared front.** Build/deploy **commands** are unauthenticated (Foxhole model — one
  shared war everyone contributes to). Game-result **reports** require a bearer token (games
  are trusted reporters). **Reset** requires an admin token.
- **Pure core, dual runtime.** Everything in `src/` is pure TypeScript with **no runtime
  dependencies** (except the browser-only `./client` subpath). The reducers run identically
  in the edge server (authoritative) and the browser (standalone/local demo mode).
- **Immutability:** reducers return a **new** `WorldState` (structuralish clone of changed
  parts is fine; do not mutate the input). Callers treat the input as frozen.
- **No `Date.now()` inside pure reducers** — callers pass `now: number` (ms epoch). Only the
  server and browser store read the clock and pass it in.

## TypeScript gotchas (monorepo strict config)

`tsconfig.base.json` sets `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`,
`isolatedModules`, `noFallthroughCasesInSwitch`. Therefore:
- Use `import type { … }` for type-only imports (verbatimModuleSyntax).
- Array index / `.find()` results are `T | undefined` — guard before use.
- No enums; use string-literal unions + `as const`.
- `export type` re-exports must use `export type`.

---

## 1. Types (`src/types.ts`)

```ts
export type HumanFaction = 'pyre' | 'wardens'
export type Faction = HumanFaction | 'scourge' | 'neutral'

export type ResourceKind = 'scrap' | 'biomass' | 'fuel' | 'intel'
export type ResourceBag = Record<ResourceKind, number>

export type GameSlug =
  | 'scourge-survivors' | 'deadlane' | 'pactfall'
  | 'starblight' | 'redline' | 'rothulk'

export type OperationKind =
  | 'purge-breach'      // scourge-survivors
  | 'hold-lane'         // deadlane
  | 'contest-territory' // pactfall
  | 'orbital-intercept' // starblight
  | 'run-logistics'     // redline
  | 'sabotage'          // rothulk

export interface Region {
  id: string
  name: string
  faction: Faction          // current controller
  pressure: number          // 0..100 Scourge corruption
  defense: number           // 0..100 fortification (mitigates pressure gain)
  x: number                 // 0..100 map coord
  y: number                 // 0..100 map coord
  breachId?: string         // present if a breach sits here
  revealed: boolean         // fog: human regions start true, others false; recon reveals
}

export interface Breach {
  id: string
  name: string
  regionId: string
  intensity: number         // 0..100 how hard it pumps
  active: boolean           // false once sealed
  sabotaged: number         // ticks remaining of halved output (0 = normal)
}

export interface Lane {
  id: string
  name: string
  from: string              // region id
  to: string                // region id
  flow: number              // 0..100 Scourge flow (spread rate along this lane)
  control: Faction          // who holds the lane
}

export interface WarEvent {
  id: string                // caller-supplied unique id (server uses crypto/uuid; tests use a counter)
  t: number                 // tick number
  at: number                // ms epoch
  kind: OperationKind | 'command' | 'tick' | 'fall' | 'seal' | 'reset' | 'system'
  faction: Faction
  game?: GameSlug
  text: string
  sealed?: boolean          // a breach was sealed
}

export interface WorldState {
  schema: number            // SCHEMA_VERSION
  epoch: number             // server-reset counter
  tick: number              // tick counter (advances each tick())
  startedAt: number         // ms epoch the (current epoch's) war began
  updatedAt: number         // ms epoch of last mutation
  resources: ResourceBag    // shared Pact war pool
  pactArmy: number          // mustered army strength
  regions: Region[]
  lanes: Lane[]
  breaches: Breach[]
  feed: WarEvent[]          // newest first, capped at FEED_MAX
}

// ---- game -> meta contract ----
export interface OperationResult {
  game: GameSlug
  faction: HumanFaction     // who ran the op
  outcome: 'victory' | 'defeat'
  score: number             // >= 0; magnitude (game score / wave / tier)
  targetId?: string         // optional explicit region/lane/breach id; else server picks
  player?: string           // optional handle
  nonce?: string            // optional idempotency key
}

// ---- build / spend / raise-army loop ----
export type Command =
  | { kind: 'fortify'; regionId: string; faction: HumanFaction; player?: string }
  | { kind: 'muster';  faction: HumanFaction; player?: string }
  | { kind: 'deploy';  regionId: string; faction: HumanFaction; player?: string }
  | { kind: 'recon';   regionId: string; faction: HumanFaction; player?: string }

export type CommandKind = Command['kind']

export interface Summary {
  regionsTotal: number
  regionsHuman: number
  regionsScourge: number
  regionsNeutral: number
  control: { pyre: number; wardens: number; scourge: number; neutral: number } // region counts
  frontControlPct: number   // 0..100 = human / (human+scourge) regions
  threat: number            // 0..100 mean pressure on human+neutral regions, weighted by breaches
  activeBreaches: number
  army: number
  resources: ResourceBag
}
```

## 2. Constants (export from `src/types.ts` or `src/constants.ts`; pick one and re-export via index)

```ts
export const SCHEMA_VERSION = 1
export const RESOURCE_KINDS: ResourceKind[] = ['scrap', 'biomass', 'fuel', 'intel']
export const FEED_MAX = 60
export const TICK_MS = 15000               // server alarm + local store interval

// passive economy per tick
export const ECON = { scrapPerHuman: 4, fuelPerHuman: 2, intelPerHuman: 1, biomassPerScourge: 2 }

// tick dynamics
export const TICK = {
  breachToPressure: 0.05,   // region.pressure += intensity * this (×0.5 if sabotaged)
  defenseMitigate: 200,     // effective gain ×= (1 - defense/this)
  laneSpread: 0.06,         // pressure transferred along a lane ∝ flow * this
  defenseDecay: 1,          // defense -= this per tick (floor 0)
  intensityRegen: 1.5,      // breach.intensity climbs back toward 100 by this (×0 if sabotaged)
  fallThreshold: 100,       // human region falls to scourge at/above this pressure
}

export const COMMAND_COSTS: Record<CommandKind, Partial<ResourceBag> & { army?: number }> = {
  fortify: { scrap: 120, fuel: 40 },
  muster:  { biomass: 80, scrap: 60 },
  deploy:  { fuel: 60, army: 40 },
  recon:   { intel: 50 },
}

export const COMMAND_EFFECT = {
  fortifyDefense: 18, fortifyPressure: -6,
  musterArmy: 25,
  deployPressure: -35, deployFlipAtPressure: 50, deployCaptureDefense: 20,
}
```

## 3. Map data (`src/map.ts`)

`createInitialWorld(now: number): WorldState` returns the fixed starting front below.
`resources = { scrap: 500, biomass: 200, fuel: 300, intel: 150 }`, `pactArmy: 0`,
`schema: SCHEMA_VERSION`, `epoch: 1`, `tick: 0`, `startedAt: now`, `updatedAt: now`, `feed: []`.

Lay out left (human) → right (Scourge); coords are `x,y` in 0..100.

### Regions (10)
| id | name | faction | pressure | defense | x | y | breachId | revealed |
|----|------|---------|----------|---------|---|---|----------|----------|
| spire | The Spire | wardens | 8 | 60 | 14 | 20 | — | true |
| ashgate | Ashgate | wardens | 14 | 50 | 22 | 48 | — | true |
| pyregate | The Pyre Gate | pyre | 10 | 45 | 12 | 76 | — | true |
| ashreach | Ash Reach | pyre | 18 | 35 | 30 | 78 | — | true |
| rustmarch | Rustmarch | neutral | 38 | 18 | 44 | 32 | — | true |
| hollowlanes | The Hollow Lanes | neutral | 46 | 14 | 48 | 60 | — | true |
| skyhook | The Skyhook (Orbital Ring) | neutral | 30 | 20 | 56 | 12 | — | true |
| maw | The Maw | scourge | 92 | 0 | 82 | 28 | breach-primus | false |
| cinder | Cinder Flats | scourge | 84 | 0 | 86 | 60 | breach-cinder | false |
| perdition | Perdition | scourge | 96 | 0 | 74 | 82 | breach-perdition | false |

### Breaches (3)
| id | name | regionId | intensity | active | sabotaged |
|----|------|----------|-----------|--------|-----------|
| breach-primus | Breach Primus | maw | 80 | true | 0 |
| breach-cinder | The Cinder Breach | cinder | 70 | true | 0 |
| breach-perdition | The Choir Node | perdition | 92 | true | 0 |

### Lanes (14) — `flow`, `control`
| id | name | from | to | flow | control |
|----|------|------|----|------|---------|
| l-spire-ashgate | Spire Causeway | spire | ashgate | 30 | wardens |
| l-ashgate-pyregate | Wardwalk | ashgate | pyregate | 28 | wardens |
| l-pyregate-ashreach | Pyre Road | pyregate | ashreach | 26 | pyre |
| l-spire-rustmarch | North Front | spire | rustmarch | 52 | neutral |
| l-ashgate-hollow | Foundry Front | ashgate | hollowlanes | 58 | neutral |
| l-ashreach-hollow | Ash Front | ashreach | hollowlanes | 50 | pyre |
| l-rust-hollow | Midspan | rustmarch | hollowlanes | 44 | neutral |
| l-rust-skyhook | Skyhook Tether | rustmarch | skyhook | 36 | neutral |
| l-rust-maw | The Maw Lane | rustmarch | maw | 72 | scourge |
| l-hollow-cinder | Cinder Lane | hollowlanes | cinder | 74 | scourge |
| l-hollow-perdition | Choir Lane | hollowlanes | perdition | 70 | scourge |
| l-skyhook-maw | Orbital Descent | skyhook | maw | 48 | scourge |
| l-maw-cinder | Scourge Spine N | maw | cinder | 60 | scourge |
| l-cinder-perdition | Scourge Spine S | cinder | perdition | 58 | scourge |

Also export helpers: `regionById(state, id)`, `laneById(state, id)`, `breachById(state, id)`,
`neighborsOf(state, regionId): Region[]` (regions one lane away), `clamp(n, lo, hi)`.

## 4. Operation contract (`src/operations.ts`)

```ts
export interface GameOperationMeta {
  game: GameSlug
  kind: OperationKind
  label: string      // e.g. "Purge a Breach"
  verb: string       // e.g. "purged"
  blurb: string      // one line of what it does to the front
  resources: ResourceKind[]  // what it primarily credits
}
export const GAME_OPERATIONS: Record<GameSlug, GameOperationMeta>
export function operationKindFor(game: GameSlug): OperationKind
```

Mapping + effect summary (the magnitude `m` is computed in the reducer, see §5):

| game | kind | target (if no targetId) | effect on victory | credits |
|------|------|--------------------------|-------------------|---------|
| scourge-survivors | purge-breach | hottest **active** breach | breach.intensity −22·m; its region.pressure −14·m; if intensity≤0 → seal (active=false, intel +120, event.sealed) | biomass +60·m, intel +25·m |
| deadlane | hold-lane | highest-flow lane bordering a human region (control scourge/neutral) | lane.flow −20·m; both endpoint **human** regions.defense +8·m | scrap +70·m, fuel +20·m |
| pactfall | contest-territory | a **neutral** region adjacent to `faction`'s territory | flip that region.faction → `result.faction` | intel +50·m |
| starblight | orbital-intercept | global | every active breach.intensity −8·m; highest-pressure region.pressure −18·m | fuel +55·m, intel +15·m |
| redline | run-logistics | global | pactArmy +6·m | scrap +90·m, fuel +70·m |
| rothulk | sabotage | hottest active breach | breach.intensity −30·m; breach.sabotaged += 4; its region.defense +4·m | biomass +50·m |

Defeat outcomes: still credit a small recon trickle (intel +8) and a smaller/negative tactical
effect (e.g. hold-lane defeat → lane.flow +8; purge defeat → no intensity change). Keep defeats
mild — a loss shouldn't wreck the front, it just doesn't help much.

## 5. Reducers (`src/reducer.ts`)

```ts
export interface ApplyResult { state: WorldState; event: WarEvent; credited: Partial<ResourceBag> }

// magnitude: victory 0.6..1.4, defeat ~0.2
//   const base = result.outcome === 'victory' ? 1 : 0.35
//   const scale = 0.6 + Math.min(Math.max(result.score, 0), 4000) / 4000 * 0.8
//   const m = base * scale
export function applyOperation(state: WorldState, result: OperationResult, now: number): ApplyResult

export function tick(state: WorldState, now: number): WorldState
export function resetWorld(now: number): WorldState   // new world, epoch = old.epoch+1 (caller passes prev epoch via closure or +1 default 1)
```

`applyOperation` must: clone state, resolve the target (by `targetId` else the rule above),
apply the effect + clamp all pressures/intensities/defense/flow to [0,100], credit resources
into `state.resources`, push a `WarEvent` (newest-first, cap FEED_MAX), set `updatedAt = now`,
and return `{ state, event, credited }`. `WarEvent.id` from `makeEventId(state)` (a pure
counter: `` `e${state.tick}-${state.feed.length}-${now}` ``).

`tick` (one step of the living world), in order:
1. `tick += 1`, `updatedAt = now`.
2. **Breach output:** for each active breach, `region.pressure += intensity * TICK.breachToPressure * (sabotaged>0 ? 0.5 : 1) * (1 - region.defense/TICK.defenseMitigate)`. Decrement `sabotaged`. Regrow `intensity += TICK.intensityRegen * (sabotaged>0?0:1)` toward 100.
3. **Lane spread:** for each lane, transfer pressure from the higher-pressure endpoint to the lower: `xfer = (hi.pressure - lo.pressure) * lane.flow/100 * TICK.laneSpread`; `lo.pressure += xfer`. (Scourge-controlled lanes spread more because flow is high.)
4. **Defense decay:** every human region `defense = max(0, defense - TICK.defenseDecay)`.
5. **Falls:** any **human** region with `pressure >= TICK.fallThreshold` → `faction='scourge'`, `defense=0`, `revealed=true`, push a `fall` WarEvent; if it borders a previously-inactive condition, optionally bump adjacent lane flow toward scourge. (Keep simple: just flip + event.)
6. **Reconquest sanity:** a scourge region with `pressure <= 25` and at least one human neighbor flips to `neutral` (the Scourge receded). Event kind `system`.
7. **Economy:** count human regions H and scourge regions S; `resources.scrap += ECON.scrapPerHuman*H`, `fuel += ECON.fuelPerHuman*H`, `intel += ECON.intelPerHuman*H`, `biomass += ECON.biomassPerScourge*S`.
8. Clamp everything to [0,100] (pressure/defense/intensity/flow). Do **not** push a feed event every tick unless something notable happened (falls/reconquest/seal) — avoid feed spam.

`resetWorld(now)`: returns `createInitialWorld(now)` but with `epoch` incremented — signature
`resetWorld(now: number, prevEpoch?: number): WorldState` → epoch = (prevEpoch ?? 0) + 1, and a
`reset` WarEvent seeded in the feed.

## 6. Commands (`src/commands.ts`)

```ts
export interface CommandResult { ok: boolean; state: WorldState; error?: string; event?: WarEvent }
export function canAfford(state: WorldState, kind: CommandKind): boolean
export function applyCommand(state: WorldState, cmd: Command, now: number): CommandResult
```

Validate cost from `COMMAND_COSTS` (including `army` for deploy) → if unaffordable return
`{ ok:false, state, error }` (state unchanged). Else clone, deduct, apply:
- **fortify**(regionId): region must be human-controlled (`pyre`|`wardens`) → defense += `COMMAND_EFFECT.fortifyDefense` (cap 100), pressure += fortifyPressure (floor 0). Else error.
- **muster**: pactArmy += `COMMAND_EFFECT.musterArmy`.
- **deploy**(regionId): pressure += deployPressure (floor 0). If region is `scourge` and resulting pressure ≤ `deployFlipAtPressure` → flip to `cmd.faction`, defense = `deployCaptureDefense`, revealed = true (recaptured!). If region is `neutral` → flip to `cmd.faction`.
- **recon**(regionId): set region.revealed = true.
Push a `command` WarEvent, set updatedAt, return `{ ok:true, state, event }`.

## 7. Summary (`src/summary.ts`)

`summarize(state): Summary` — pure derivation (counts, frontControlPct = humanRegions/(human+scourge)·100,
threat = clamp(mean pressure over human+neutral regions + 0.3·mean active-breach intensity, 0, 100)).

## 8. Client SDK (`src/client.ts`, package subpath `@shipshitgames/warline/client`)

Browser/fetch only. May import `partysocket`.
```ts
export interface WarlineClientOptions { host: string; token?: string }
export interface ReportResponse { ok: boolean; summary?: Summary; credited?: Partial<ResourceBag>; error?: string }
export class WarlineClient {
  constructor(opts: WarlineClientOptions)
  fetchState(): Promise<WorldState>                                  // GET
  reportOperation(result: OperationResult): Promise<ReportResponse>  // POST {type:'report'}, Bearer token
  sendCommand(cmd: Command): Promise<{ ok: boolean; error?: string }>// POST {type:'command'}
}
export interface WarlineSocket { send: (msg: unknown) => void; close: () => void }
export function connectWarline(host: string, handlers: {
  onState: (s: WorldState) => void
  onStatus?: (connected: boolean) => void
}): WarlineSocket   // PartySocket party:'main' room:'front'; parses {t:'hello'|'state', state}
```
URL base: `${proto}//${host}/parties/main/front`. The package exports `warlineUrl(host)` helper.

## 9. Index barrel (`src/index.ts`)
Re-export everything from types, constants, map, operations, reducer, commands, summary
(but **not** client — client is the browser subpath, exported only via `./client`, so the pure
core stays dependency-free and server-safe).

## 10. package.json (`@shipshitgames/warline`)
Mirror `@shipshitgames/shared` but add the `./client` export and `partysocket` dependency:
```jsonc
{
  "name": "@shipshitgames/warline", "version": "0.0.0", "private": true, "type": "module",
  "main": "./src/index.ts", "module": "./src/index.ts", "types": "./src/index.ts",
  "exports": {
    ".":        { "types": "./src/index.ts",        "default": "./src/index.ts" },
    "./client": { "types": "./src/client.ts",       "default": "./src/client.ts" }
  },
  "scripts": { "lint": "tsc --noEmit", "typecheck": "tsc --noEmit", "test": "node --test --experimental-strip-types src/*.test.ts" },
  "dependencies": { "partysocket": "^1.1.19" },
  "devDependencies": { "typescript": "5.7.3" }
}
```
`tsconfig.json`: `{ "extends": "../../tsconfig.base.json", "compilerOptions": { "lib": ["ES2022","DOM"], "noEmit": true }, "include": ["src"] }`

## 11. Tests (`src/reducer.test.ts`, `src/commands.test.ts`) — `node --test`
Cover: createInitialWorld shape; applyOperation purge reduces breach intensity + credits biomass;
sealing a breach (force intensity low then purge) sets active=false; hold-lane reduces flow;
tick raises pressure near breaches and never exceeds 100; a maxed-pressure human region falls;
applyCommand fortify raises defense & costs scrap; deploy on a weak scourge region recaptures it;
canAfford false when broke. Use a small pure event-id; no network.

---

## 12. Server protocol — `apps/warline/party/warline.ts` (PartyKit Durable Object)

- Party `main`, room id `front` (singleton). Base path `/parties/main/front`.
- **State:** holds one `WorldState`; load from `room.storage.get('world')` in `onStart`, else
  `createInitialWorld(Date.now())`; `room.storage.put('world', state)` after every mutation.
- **Tick:** in `onStart`, if no alarm pending, `room.storage.setAlarm(Date.now()+TICK_MS)`.
  `onAlarm()` → `state = tick(state, Date.now())`, persist, broadcast, set next alarm.
- **WS** `onConnect(conn)` → `conn.send({ t:'hello', state })`.
  `onMessage(raw, conn)`:
  - `{ t:'command', command }` → `applyCommand`; persist; **broadcast** `{ t:'state', state }`; reply `{ t:'cmdresult', ok, error }` to sender.
  - `{ t:'sim', game? }` → **demo**: synthesize a plausible `OperationResult` (random-ish from the connection/time; pick `game` or random) and `applyOperation`; persist; broadcast. (Lets the stream demo the loop with no token. Clearly a demo path.)
  - `{ t:'reset', token }` → if `token === ADMIN_TOKEN` → `resetWorld`; persist; broadcast.
- **HTTP** `onRequest(req)` (CORS `*`, handle `OPTIONS`):
  - `GET` → `{ state, summary: summarize(state) }`.
  - `POST {type:'report', result}` → require `Authorization: Bearer ${WARLINE_TOKEN}` (if env unset, allow + warn in dev); `applyOperation`; persist; broadcast `{t:'state',state}`; return `{ ok, summary, credited, event }`.
  - `POST {type:'command', command}` → open; `applyCommand`; persist; broadcast; return `{ ok, error?, summary }`.
  - `POST {type:'reset'}` → require `Bearer ${WARLINE_ADMIN_TOKEN}`; reset; broadcast.
- Env via `this.room.env` (PartyKit): `WARLINE_TOKEN`, `WARLINE_ADMIN_TOKEN`. Missing → dev-permissive with a `console.warn`.
- Broadcast helper: `this.room.broadcast(JSON.stringify({ t:'state', state }))`.
- `partykit.json`: `{ "$schema":"https://www.partykit.io/schema.json", "name":"warline", "main":"party/warline.ts", "compatibilityDate":"2024-09-01" }`.
- Server imports ONLY from `@shipshitgames/warline` (the pure core) — never `@shipshitgames/warline/client`.

## 13. Web hub — `apps/warline/src/**` (Vite + React 19 + Tailwind v4)

- **Store** `src/store.ts` — `useWarline()` hook returning `{ state, summary, status, faction, setFaction, command(cmd), simulate(game?), connected }`.
  - Connects via `connectWarline(WARLINE_HOST, …)` from `@shipshitgames/warline/client`.
  - **Dual mode:** if a socket connects → mirror server `state`; `command()`/`simulate()` send over ws.
    If it never connects (no server deployed) → **local mode**: seed `createInitialWorld(Date.now())`,
    run `tick()` every `TICK_MS` via `setInterval`, and apply `applyCommand`/`applyOperation` locally
    so the hub is fully playable standalone (great for the Vercel-only demo). Show status `LIVE` vs `LOCAL`.
  - `WARLINE_HOST = import.meta.env.VITE_WARLINE_HOST || (import.meta.env.DEV ? 'localhost:1999' : '')`.
    Empty host ⇒ skip connecting ⇒ local mode.
  - faction persisted in localStorage (`warline.faction`, default `wardens`).
- **Components** (`src/components/`):
  - `Header.tsx` — title "WARLINE / War for the Lanes", epoch + tick, status pill (LIVE/LOCAL), threat meter bar.
  - `ResourceBar.tsx` — scrap / biomass / fuel / intel + Pact Army, mono numerics, DOOM styling.
  - `WarMap.tsx` — **SVG** `viewBox="0 0 100 100"`: lanes as lines (color by control, stroke-width/dash by flow), regions as nodes (color by faction: wardens=blood `#c1121f`, pyre=hellfire `#ff6a00`, scourge=toxic `#8bdc1f`, neutral=gunmetal `#34343c`), pressure as a red ring/heat overlay, breaches as pulsing toxic markers, defense pip. Click region → select; unrevealed scourge regions render as "?" until reconned. Tooltip on hover.
  - `WarFeed.tsx` — newest-first event list, color-coded by kind/faction.
  - `CommandPanel.tsx` — faction toggle (Pyre/Wardens), selected region, Fortify / Muster / Deploy / Recon buttons with costs from `COMMAND_COSTS`, disabled when `!canAfford`.
  - `OpsPanel.tsx` — one "Run operation" button per game (label from `GAME_OPERATIONS`), fires `simulate(game)`. Header "DEMO / Operation feed". Shows each game→op mapping.
  - `Legend.tsx` — faction + symbol legend.
- `src/App.tsx` composes: Header, then a grid — WarMap (large) + right rail (ResourceBar, CommandPanel, OpsPanel) + WarFeed below. Responsive (1col mobile → 2/3 col lg).
- `src/main.tsx` mounts React root (no StrictMode needed; fine to include). `src/styles.css` = `@import 'tailwindcss';` + the **same `@theme` DOOM tokens** as `apps/web/app/globals.css` (void/coal/iron/gunmetal/blood/bloodHot/hellfire/rust/bone/ash/toxic + Oswald/Inter fonts + ember shadow) + a `@keyframes breachpulse` for breach markers. Fonts via `index.html` Google Fonts links (Oswald 500;700 + Inter 400;600).
- **Config:** `vite.config.ts` with `base: './'` (REQUIRED for `/warline/` proxy hosting), `@vitejs/plugin-react`, `@tailwindcss/vite`, `@` alias → `./src`. `tsconfig.json` mirror scourge-survivors' (strict, bundler, jsx react-jsx, `@/*` paths) + `tsconfig.node.json` for vite.config. `index.html` with `#root` + `/src/main.tsx` + font links + title "Warline — War for the Lanes". `vite-env.d.ts` = `/// <reference types="vite/client" />`.
- **package.json** `apps/warline`:
  ```jsonc
  { "name":"warline","private":true,"version":"0.1.0","type":"module",
    "scripts": { "dev":"vite", "dev:all":"concurrently -k -n web,party -c blue,magenta \"vite\" \"partykit dev\"",
      "build":"tsc && vite build", "preview":"vite preview", "typecheck":"tsc --noEmit",
      "party:dev":"partykit dev", "party:deploy":"partykit deploy" },
    "dependencies": { "@shipshitgames/warline":"workspace:*", "partysocket":"^1.1.19", "react":"19.1.0", "react-dom":"19.1.0" },
    "devDependencies": { "@tailwindcss/vite":"^4.1.8","@types/react":"19.1.6","@types/react-dom":"19.1.5",
      "@vitejs/plugin-react":"^4.3.3","concurrently":"^9.2.1","partykit":"^0.0.114","tailwindcss":"^4.1.8","typescript":"5.8.3","vite":"^5.4.10" } }
  ```
  (Web agent owns this file; it includes the `partykit`/`partysocket` deps the server needs. Server agent must NOT create package.json.)
- `README.md` for the app: what it is, `bun run dev` / `dev:all`, env (`VITE_WARLINE_HOST`, `WARLINE_TOKEN`), the game→meta contract table, deploy notes.
