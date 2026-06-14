/**
 * Feature flags for the Ship Shit Games platform.
 *
 * A flag lets unfinished or environment-specific work merge to `master` "dark":
 * present in the build but inert until its env var is turned on. That is a
 * prerequisite for trunk-based development — code ships continuously without
 * being exposed before it is ready.
 *
 * Conventions (see `packages/shared/FEATURE_FLAGS.md`):
 *   - Register every flag in `FLAGS`, then gate code with `isEnabled("name")`.
 *   - Server flags read a plain env var (e.g. `SKOOL_FULFILLMENT_ENABLED`).
 *   - Client/browser flags MUST use a `NEXT_PUBLIC_`-prefixed env var so Next.js
 *     inlines them into the client bundle; mark them with `client: true`.
 *   - A flag is "on" only when its env var is one of `true` / `1` / `on` / `yes`
 *     (any case, surrounding whitespace ignored). Anything else — including
 *     unset — is "off". Flags fail closed.
 */

/** Definition of a single feature flag. */
export interface FlagDef {
  /** Environment variable that toggles the flag. */
  env: string;
  /** What the flag guards. Shown in docs and debug snapshots. */
  description: string;
  /**
   * True when the flag controls client-visible behaviour and its env var is
   * therefore `NEXT_PUBLIC_`-prefixed (inlined into the browser bundle).
   */
  client?: boolean;
}

/**
 * The flag registry. Add a flag here, gate code with `isEnabled("yourFlag")`,
 * and delete the flag once the work it guards is permanently on. Keep this list
 * short — a flag is a temporary seam, not a config system.
 */
export const FLAGS = {
  /** Send Skool community invites during Studio Pass fulfillment. */
  skoolFulfillment: {
    env: "SKOOL_FULFILLMENT_ENABLED",
    description: "Send Skool community invites during Studio Pass fulfillment.",
  },
} as const satisfies Record<string, FlagDef>;

/** Union of registered flag names. */
export type FlagName = keyof typeof FLAGS;

const TRUTHY = new Set(["true", "1", "on", "yes"]);

/** Interpret a raw env value as on/off using the shared truthy convention. */
export function isFlagValueOn(raw: string | undefined | null): boolean {
  return raw != null && TRUTHY.has(raw.trim().toLowerCase());
}

/**
 * Returns true when `flag` is enabled in the current environment. Unset or
 * non-truthy env vars resolve to false, so flags fail closed.
 */
export function isEnabled(flag: FlagName): boolean {
  return isFlagValueOn(process.env[FLAGS[flag].env]);
}

/**
 * Snapshot of every flag's current state. Useful for a debug endpoint, a
 * startup log line, or asserting flag wiring in tests.
 */
export function flagSnapshot(): Record<FlagName, boolean> {
  const out = {} as Record<FlagName, boolean>;
  for (const name of Object.keys(FLAGS) as FlagName[]) out[name] = isEnabled(name);
  return out;
}
