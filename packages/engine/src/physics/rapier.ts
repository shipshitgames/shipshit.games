/**
 * The initialised Rapier 2D module namespace (classes + factories).
 *
 * Sourced from `@dimforge/rapier2d-compat`: the WASM is embedded as base64 and
 * decoded by {@link ensureRapier}, so there is no separate `.wasm` asset to host
 * or configure — the same build runs in a Vite browser bundle, in Node, and in
 * `bun test`. That portability is why the engine pins the *compat* build.
 *
 * The dependency is referenced through `import type` / dynamic `import()` only, so
 * importing the physics subpath never *statically* resolves the package — see
 * {@link ensureRapier}.
 */
export type RapierModule = typeof import('@dimforge/rapier2d-compat').default

let pending: Promise<RapierModule> | null = null

/**
 * The engine's one WASM-load story, shared by every game: initialise Rapier's
 * WebAssembly exactly once, lazily, and resolve to the ready module.
 *
 * Call `await ensureRapier()` during async boot — before constructing a
 * {@link PhysicsSystem} — or just use {@link PhysicsSystem.create}, which awaits
 * it for you. The init promise is memoised, so concurrent callers and later
 * scenes all share the single initialisation instead of racing or re-decoding.
 *
 * `@dimforge/rapier2d-compat` is an **optional** dependency (mirroring the
 * `partysocket` net seam): it is lazily `import()`-ed on first use, so a game that
 * never touches the physics subpath never needs it, and a consumer who installed
 * with `--omit=optional` gets a descriptive error here instead of an opaque
 * module-resolution failure. A failed load is not memoised, so a later retry can
 * still succeed once the dependency is present.
 *
 * ```ts
 * const physics = await PhysicsSystem.create({ gravity: { x: 0, z: 0 } })
 * // ...or, when you manage construction yourself:
 * const rapier = await ensureRapier()
 * const physics = new PhysicsSystem(rapier, { fixedTimeStep: 1 / 60 })
 * ```
 */
export function ensureRapier(): Promise<RapierModule> {
  if (!pending) {
    pending = loadRapier().catch((error: unknown) => {
      pending = null // don't cache a failed load — let a later call retry
      throw error
    })
  }
  return pending
}

async function loadRapier(): Promise<RapierModule> {
  let mod: typeof import('@dimforge/rapier2d-compat')
  try {
    mod = await import('@dimforge/rapier2d-compat')
  } catch (cause) {
    throw new Error(
      "@shipshitgames/engine/physics needs the optional '@dimforge/rapier2d-compat' dependency. " +
        'Install @dimforge/rapier2d-compat, or do not import the physics subpath.',
      { cause },
    )
  }
  const rapier = mod.default
  await rapier.init()
  return rapier
}
