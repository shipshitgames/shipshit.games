import { execFileSync } from "node:child_process";

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
