/** Address served by a local `partykit dev` process. */
export const DEFAULT_DEV_PARTYKIT_HOST = 'localhost:1999'

export interface PartyKitHostEnv {
  /** Explicitly configured host, e.g. `import.meta.env.VITE_PARTYKIT_HOST`. */
  envHost?: string | undefined
  /** Whether this is a dev build, e.g. `import.meta.env.DEV`. */
  dev?: boolean | undefined
}

/**
 * Resolve the PartyKit host without binding the engine to any bundler:
 * an explicitly configured host wins, dev builds fall back to the local
 * `partykit dev` server, and prod with no host resolves to '' so the game
 * can treat multiplayer as unconfigured rather than dialing a bad address.
 *
 * Games pass their own build-tool values, e.g.
 * `resolvePartyKitHost({ envHost: import.meta.env.VITE_PARTYKIT_HOST, dev: import.meta.env.DEV })`.
 */
export function resolvePartyKitHost(env: PartyKitHostEnv = {}): string {
  if (env.envHost) return env.envHost
  return env.dev ? DEFAULT_DEV_PARTYKIT_HOST : ''
}
