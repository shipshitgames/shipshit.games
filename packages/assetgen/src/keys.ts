import { execFileSync } from "node:child_process";

/**
 * Where a keyed provider's credential lives: the env var read first, the keychain
 * service it falls back to, and the human label used in error copy. Kept next to
 * {@link getKey}/{@link missingKeyMessage} so the bundle-safe catalog and the fal
 * client can describe a key without importing the heavy providers.ts seam.
 */
export interface ProviderKeyConfig {
  envName: string;
  service: string;
  label: string;
}

/**
 * The shared "no key" error for a keyed provider. providers.ts and the bundle-safe
 * fal.ts client both raise it, so the env-var/keychain guidance can't drift between
 * them (it had been hand-copied byte-for-byte before).
 */
export function missingKeyMessage(key: ProviderKeyConfig): Error {
  return new Error(
    `No ${key.label} key. Set ${key.envName}, or store it the shipcode way:\n` +
      `  security add-generic-password -a shipshit -s ${key.service} -w <KEY>`,
  );
}

/**
 * Resolve an API key the shipcode way: env var first, then the OS keychain.
 * Store a key on macOS with:
 *   security add-generic-password -a shipshit -s <service> -w <KEY>
 * (The `codex` provider needs none of this — it rides codex's own keychain auth.)
 */
export function getKey(envName: string, service: string): string | undefined {
  const fromEnv = process.env[envName];
  if (fromEnv) return fromEnv;
  if (process.platform === "darwin") {
    try {
      const v = execFileSync(
        "security",
        ["find-generic-password", "-a", "shipshit", "-s", service, "-w"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      ).trim();
      if (v) return v;
    } catch {
      /* not in keychain */
    }
  }
  return undefined;
}
